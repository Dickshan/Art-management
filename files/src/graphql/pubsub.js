const { RedisPubSub } = require('graphql-redis-subscriptions');
const { redisPub, redisSub } = require('../config/redis');

const pubsub = new RedisPubSub({
  publisher: redisPub,
  subscriber: redisSub,
});

const TOPICS = {
  ACTIVITY_RECEIVED: (userId) => `ACTIVITY_RECEIVED.${userId}`,
  ARTWORK_LIKED: (artworkId) => `ARTWORK_LIKED.${artworkId}`,
};

module.exports = { pubsub, TOPICS };
