const { Transaction, User, Artwork, Activity } = require('../../models');
const { requireAuth } = require('../../middleware/auth');
const { pubsub, TOPICS } = require('../pubsub');

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------
const transactionFieldResolvers = {
  Transaction: {
    id:        (t) => t.id,
    artwork:   (t) => Artwork.findByPk(t.artworkId),
    seller:    (t) => User.findByPk(t.sellerId),
    buyer:     (t) => User.findByPk(t.buyerId),
    createdAt: (t) => new Date(t.created_at || t.createdAt).toISOString(),
  },
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
const transactionQueries = {
  myTransactions: async (_p, _a, context) => {
    const user = requireAuth(context);
    return Transaction.findAll({
      where: { sellerId: user.id },
      order: [['created_at', 'DESC']],
    });
  },
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
const transactionMutations = {
  recordSale: async (_p, { artworkId, buyerUsername, paymentMethod }, context) => {
    const seller = requireAuth(context);
    const artwork = await Artwork.findByPk(artworkId);
    if (!artwork) throw new Error('Artz not found');
    if (artwork.ownerId !== seller.id) throw new Error('Only the owner can record a sale');

    const buyer = await User.findOne({ where: { username: buyerUsername } });
    if (!buyer) throw new Error('Buyer not found');

    const transaction = await Transaction.create({
      artworkId,
      sellerId:      seller.id,
      buyerId:       buyer.id,
      amountCents:   Math.round(Number(artwork.price) * 100),
      currency:      artwork.currency,
      paymentMethod,
      status:        'completed',
    });

    await artwork.update({ status: 'sold' });

    const activity = await Activity.create({
      recipientId: seller.id,
      actorId:     buyer.id,
      type:        'sale',
      artworkId:   artwork.id,
      amountCents: transaction.amountCents,
    });
    await pubsub.publish(TOPICS.ACTIVITY_RECEIVED(seller.id), { activityReceived: activity });

    return transaction;
  },
};

module.exports = { transactionFieldResolvers, transactionQueries, transactionMutations };
