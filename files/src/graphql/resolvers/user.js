const { Op } = require('sequelize');
const { User, Follow, PaymentMethod, Artwork } = require('../../models');
const { requireAuth } = require('../../middleware/auth');
const { hashPassword, verifyPassword, signToken } = require('../../services/auth');
const { redis, invalidate } = require('../../config/redis');

// ---------------------------------------------------------------------------
// Helper: cached follower/following/artwork counts
// ---------------------------------------------------------------------------
async function counts(userId) {
  const cacheKey = `user:${userId}:counts`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const [followerCount, followingCount, artzCount] = await Promise.all([
    Follow.count({ where: { followeeId: userId } }),
    Follow.count({ where: { followerId: userId } }),
    Artwork.count({ where: { ownerId: userId } }),
  ]);
  const result = { followerCount, followingCount, artzCount };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
  return result;
}

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------
const userFieldResolvers = {
  User: {
    followerCount:  (user) => counts(user.id).then((c) => c.followerCount),
    followingCount: (user) => counts(user.id).then((c) => c.followingCount),
    artzCount:      (user) => counts(user.id).then((c) => c.artzCount),
    isFollowedByMe: async (user, _args, context) => {
      if (!context.user) return false;
      const row = await Follow.findOne({ where: { followerId: context.user.id, followeeId: user.id } });
      return !!row;
    },
    paymentMethods: (user) => PaymentMethod.findAll({ where: { userId: user.id } }),
  },
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const userQueries = {
  me:   (_p, _a, context) => context.user,
  user: (_p, { username }) => User.findOne({ where: { username } }),
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
const userMutations = {
  signup: async (_p, { username, email, password, displayName }) => {
    const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (existing) throw new Error('Username or email already in use');

    const passwordHash = await hashPassword(password);
    const user = await User.create({ username, email, passwordHash, displayName });
    return { token: signToken(user), user };
  },

  login: async (_p, { identifier, password }) => {
    const user = await User.findOne({
      where: { [Op.or]: [{ username: identifier }, { email: identifier }] },
    });
    if (!user) throw new Error('Invalid credentials');

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    return { token: signToken(user), user };
  },

  updateProfile: async (_p, args, context) => {
    const user = requireAuth(context);
    await user.update({
      displayName: args.displayName ?? user.displayName,
      bio:         args.bio         ?? user.bio,
      avatarUrl:   args.avatarUrl   ?? user.avatarUrl,
      location:    args.location    ?? user.location,
    });
    return user;
  },

  updatePrivacySettings: async (_p, args, context) => {
    const user = requireAuth(context);
    await user.update({
      isPrivate:            args.isPrivate            ?? user.isPrivate,
      twoFactorEnabled:     args.twoFactorEnabled     ?? user.twoFactorEnabled,
      showSalesPublicly:    args.showSalesPublicly     ?? user.showSalesPublicly,
      emailOnNewFollower:   args.emailOnNewFollower    ?? user.emailOnNewFollower,
    });
    return user;
  },

  changePassword: async (_p, { currentPassword, newPassword }, context) => {
    const user = requireAuth(context);
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect');
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    return true;
  },

  follow: async (_p, { username }, context) => {
    const me = requireAuth(context);
    const target = await User.findOne({ where: { username } });
    if (!target) throw new Error('User not found');
    if (target.id === me.id) throw new Error('Cannot follow yourself');

    await Follow.findOrCreate({ where: { followerId: me.id, followeeId: target.id } });
    await invalidate(`user:${me.id}:counts`, `user:${target.id}:counts`);
    return target;
  },

  unfollow: async (_p, { username }, context) => {
    const me = requireAuth(context);
    const target = await User.findOne({ where: { username } });
    if (!target) throw new Error('User not found');

    await Follow.destroy({ where: { followerId: me.id, followeeId: target.id } });
    await invalidate(`user:${me.id}:counts`, `user:${target.id}:counts`);
    return target;
  },

  upsertPaymentMethod: async (_p, { input }, context) => {
    const user = requireAuth(context);
    const [method] = await PaymentMethod.findOrCreate({
      where:    { userId: user.id, type: input.type },
      defaults: { userId: user.id, type: input.type },
    });
    await method.update({
      upiId:      input.upiId      ?? method.upiId,
      qrCodeUrl:  input.qrCodeUrl  ?? method.qrCodeUrl,
    });
    return method;
  },
};

module.exports = { userFieldResolvers, userQueries, userMutations };
