const { userFieldResolvers, userQueries, userMutations } = require('./user');
const { artworkFieldResolvers, artworkQueries, artworkMutations } = require('./artwork');
const { collectionFieldResolvers, collectionQueries, collectionMutations } = require('./collection');
const {
  activityFieldResolvers,
  activityQueries,
  activityMutations,
  activitySubscriptions,
} = require('./activity');
const { transactionFieldResolvers, transactionQueries, transactionMutations } = require('./transaction');
const { pubsub, TOPICS } = require('../pubsub');

const resolvers = {
  Query: {
    ...userQueries,
    ...artworkQueries,
    ...collectionQueries,
    ...activityQueries,
    ...transactionQueries,
  },
  Mutation: {
    ...userMutations,
    ...artworkMutations,
    ...collectionMutations,
    ...activityMutations,
    ...transactionMutations,
  },
  Subscription: {
    ...activitySubscriptions,
    artworkLiked: {
      subscribe: (_p, { artworkId }) => {
        return pubsub.asyncIterator(TOPICS.ARTWORK_LIKED(artworkId));
      },
    },
  },
  ...userFieldResolvers,
  ...artworkFieldResolvers,
  ...collectionFieldResolvers,
  ...activityFieldResolvers,
  ...transactionFieldResolvers,
};

module.exports = resolvers;
