const { Collection, CollectionArtwork, Artwork } = require('../../models');
const { requireAuth } = require('../../middleware/auth');

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------
const collectionFieldResolvers = {
  Collection: {
    id:        (c) => c.id,
    artworks:  (c) =>
      Artwork.findAll({
        include: [{ model: CollectionArtwork, as: 'CollectionArtworks', where: { collectionId: c.id }, attributes: [] }],
        order:   [[CollectionArtwork, 'position', 'ASC']],
      }),
    createdAt: (c) => new Date(c.created_at || c.createdAt).toISOString(),
  },
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const collectionQueries = {
  myCollections: (_p, _a, context) => {
    const user = requireAuth(context);
    return Collection.findAll({ where: { ownerId: user.id }, order: [['created_at', 'DESC']] });
  },
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
const collectionMutations = {
  createCollection: async (_p, { name }, context) => {
    const user = requireAuth(context);
    return Collection.create({ ownerId: user.id, name });
  },

  addToCollection: async (_p, { collectionId, artworkId }, context) => {
    const user = requireAuth(context);
    const collection = await Collection.findByPk(collectionId);
    if (!collection) throw new Error('Collection not found');
    if (collection.ownerId !== user.id) throw new Error('Not authorized');

    // Upsert to be idempotent
    const [, created] = await CollectionArtwork.findOrCreate({
      where:    { collectionId, artworkId },
      defaults: {
        collectionId,
        artworkId,
        position: await CollectionArtwork.count({ where: { collectionId } }),
      },
    });

    // Set cover image if the collection doesn't have one yet
    if (created && !collection.coverImageUrl) {
      const artwork = await Artwork.findByPk(artworkId);
      if (artwork) await collection.update({ coverImageUrl: artwork.imageUrl });
    }

    return collection.reload();
  },

  removeFromCollection: async (_p, { collectionId, artworkId }, context) => {
    const user = requireAuth(context);
    const collection = await Collection.findByPk(collectionId);
    if (!collection) throw new Error('Collection not found');
    if (collection.ownerId !== user.id) throw new Error('Not authorized');

    await CollectionArtwork.destroy({ where: { collectionId, artworkId } });
    return collection.reload();
  },
};

module.exports = { collectionFieldResolvers, collectionQueries, collectionMutations };
