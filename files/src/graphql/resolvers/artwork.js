const { Op } = require('sequelize');
const { Artwork, Like, Comment, Activity, User } = require('../../models');
const { requireAuth } = require('../../middleware/auth');
const { cached, invalidate } = require('../../config/redis');
const { pubsub, TOPICS } = require('../pubsub');
const { generateArtworkDescription, semanticSearch, recommendSimilar } = require('../../services/openai');

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------
const artworkFieldResolvers = {
  Artwork: {
    id:          (a) => a.id,
    owner:       (a) => User.findByPk(a.ownerId),
    // Expose AI metadata from the JSONB column via convenience helpers
    aiTags:      (a) => a.getAiTags(),
    aiGeneratedDescription: (a) => a.getAiGeneratedDescription(),
    likedByMe: async (a, _args, context) => {
      if (!context.user) return false;
      const hit = await Like.findOne({ where: { artworkId: a.id, userId: context.user.id } });
      return !!hit;
    },
    createdAt: (a) => new Date(a.created_at || a.createdAt).toISOString(),
  },
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const artworkQueries = {
  myArtz: (_p, _a, context) => {
    const user = requireAuth(context);
    return cached(`artz:owner:${user.id}`, 30, () =>
      Artwork.findAll({ where: { ownerId: user.id }, order: [['created_at', 'DESC']] })
    );
  },

  userArtz: async (_p, { username }) => {
    const owner = await User.findOne({ where: { username } });
    if (!owner) return [];
    return cached(`artz:owner:${owner.id}`, 30, () =>
      Artwork.findAll({ where: { ownerId: owner.id }, order: [['created_at', 'DESC']] })
    );
  },

  artwork: (_p, { id }) => Artwork.findByPk(id),

  searchArtz: async (_p, { query }) => {
    // AI-powered semantic search (falls back to trigram/ILIKE without an API key)
    const pool = await Artwork.findAll({
      where: {
        status: 'available',
        [Op.or]: [
          { title:       { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
        ],
      },
      limit: 200,
    });
    return semanticSearch(query, pool);
  },

  recommendedArtz: async (_p, { artworkId }) => {
    const target = await Artwork.findByPk(artworkId);
    if (!target) return [];
    const pool = await Artwork.findAll({
      where: { status: 'available', category: target.category, id: { [Op.ne]: artworkId } },
      limit: 100,
    });
    return recommendSimilar(target, pool);
  },
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
const artworkMutations = {
  createArtz: async (_p, { input }, context) => {
    const user = requireAuth(context);

    let description = input.description || '';
    if (input.generateDescription || !description) {
      description = await generateArtworkDescription({
        title:    input.title,
        category: input.category,
        tags:     input.aiTags || [],
      });
    }

    const artwork = await Artwork.create({
      ownerId:     user.id,
      title:       input.title,
      description,
      price:       input.price,
      category:    input.category,
      imageUrl:    input.imageUrl,
      metadata: {
        ai_tags:                    input.aiTags || [],
        ai_generated_description:   input.generateDescription ? description : null,
        style_embedding:            null,
      },
    });

    await invalidate(`artz:owner:${user.id}`);
    return artwork;
  },

  updateArtz: async (_p, { id, input }, context) => {
    const user = requireAuth(context);
    const artwork = await Artwork.findByPk(id);
    if (!artwork) throw new Error('Artz not found');
    if (artwork.ownerId !== user.id) throw new Error('Not authorized to edit this artz');

    const updates = {};
    if (input.title       != null) updates.title       = input.title;
    if (input.description != null) updates.description = input.description;
    if (input.price       != null) updates.price       = input.price;
    if (input.category    != null) updates.category    = input.category;
    if (input.imageUrl    != null) updates.imageUrl    = input.imageUrl;
    if (input.aiTags      != null) {
      updates.metadata = { ...artwork.metadata, ai_tags: input.aiTags };
    }

    await artwork.update(updates);
    await invalidate(`artz:owner:${user.id}`);
    return artwork;
  },

  deleteArtz: async (_p, { id }, context) => {
    const user = requireAuth(context);
    const artwork = await Artwork.findByPk(id);
    if (!artwork) throw new Error('Artz not found');
    if (artwork.ownerId !== user.id) throw new Error('Not authorized to delete this artz');

    await artwork.destroy();
    await invalidate(`artz:owner:${user.id}`);
    return true;
  },

  toggleLike: async (_p, { artworkId }, context) => {
    const user = requireAuth(context);
    const artwork = await Artwork.findByPk(artworkId);
    if (!artwork) throw new Error('Artz not found');

    const existing = await Like.findOne({ where: { artworkId, userId: user.id } });

    if (existing) {
      // Unlike — the DB trigger decrements like_count
      await existing.destroy();
    } else {
      // Like — the DB trigger increments like_count
      await Like.create({ artworkId, userId: user.id });

      if (artwork.ownerId !== user.id) {
        const activity = await Activity.create({
          recipientId: artwork.ownerId,
          actorId:     user.id,
          type:        'like',
          artworkId:   artwork.id,
        });
        await pubsub.publish(TOPICS.ACTIVITY_RECEIVED(artwork.ownerId), { activityReceived: activity });
      }
    }

    // Reload to pick up the trigger-updated like_count
    await artwork.reload();
    await invalidate(`artz:owner:${artwork.ownerId}`);
    await pubsub.publish(TOPICS.ARTWORK_LIKED(artwork.id), { artworkLiked: artwork });
    return artwork;
  },

  commentOnArtz: async (_p, { artworkId, text }, context) => {
    const user = requireAuth(context);
    const artwork = await Artwork.findByPk(artworkId);
    if (!artwork) throw new Error('Artz not found');

    // Create the comment record first, then reference it in the activity
    const comment = await Comment.create({ artworkId, userId: user.id, text });

    const activity = await Activity.create({
      recipientId: artwork.ownerId,
      actorId:     user.id,
      type:        'comment',
      artworkId:   artwork.id,
      commentId:   comment.id,
    });

    // Attach the comment text so the field resolver can read it without a join
    activity.dataValues.commentText = text;

    await pubsub.publish(TOPICS.ACTIVITY_RECEIVED(artwork.ownerId), { activityReceived: activity });
    return activity;
  },
};

module.exports = { artworkFieldResolvers, artworkQueries, artworkMutations };
