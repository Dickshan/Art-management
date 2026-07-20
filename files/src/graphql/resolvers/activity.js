const { Activity, Artwork, User, Comment } = require('../../models');
const { requireAuth } = require('../../middleware/auth');
const { pubsub, TOPICS } = require('../pubsub');

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------
const activityFieldResolvers = {
  Activity: {
    id:          (a) => a.id,
    actor:       (a) => User.findByPk(a.actorId),
    artwork:     (a) => (a.artworkId ? Artwork.findByPk(a.artworkId) : null),
    // commentText: read from the linked Comment row, or from an in-memory hint
    // set by commentOnArtz (avoids an extra round-trip on fresh creates).
    commentText: async (a) => {
      if (a.dataValues.commentText != null) return a.dataValues.commentText;
      if (!a.commentId) return null;
      const comment = await Comment.findByPk(a.commentId);
      return comment ? comment.text : null;
    },
    createdAt:   (a) => new Date(a.created_at || a.createdAt).toISOString(),
  },
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const activityQueries = {
  myActivity: async (_p, { unreadOnly }, context) => {
    const user = requireAuth(context);
    const where = { recipientId: user.id };
    if (unreadOnly) where.read = false;
    return Activity.findAll({ where, order: [['created_at', 'DESC']], limit: 100 });
  },
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
const activityMutations = {
  markActivityRead: async (_p, { activityId }, context) => {
    const user = requireAuth(context);
    const activity = await Activity.findByPk(activityId);
    if (!activity) throw new Error('Activity not found');
    if (activity.recipientId !== user.id) throw new Error('Not authorized');
    await activity.update({ read: true });
    return activity;
  },

  markAllActivityRead: async (_p, _a, context) => {
    const user = requireAuth(context);
    await Activity.update({ read: true }, { where: { recipientId: user.id, read: false } });
    return true;
  },
};

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
const activitySubscriptions = {
  activityReceived: {
    subscribe: (_p, _a, context) => {
      const user = requireAuth(context);
      return pubsub.asyncIterator(TOPICS.ACTIVITY_RECEIVED(user.id));
    },
  },
};

module.exports = { activityFieldResolvers, activityQueries, activityMutations, activitySubscriptions };
