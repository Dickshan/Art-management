/**
 * src/models/index.js
 *
 * Single source of truth for all Sequelize models.
 * PostgreSQL-only; MongoDB has been removed.
 * Flexible artwork metadata (ai_tags, style_embedding, etc.) lives in the
 * `metadata` JSONB column so the schema never needs altering as AI features evolve.
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/postgres');

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
const User = sequelize.define(
  'User',
  {
    id:                   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    username:             { type: DataTypes.STRING(30),  unique: true, allowNull: false },
    email:                { type: DataTypes.STRING(255), unique: true, allowNull: false },
    passwordHash:         { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    displayName:          { type: DataTypes.STRING(80),  allowNull: false, field: 'display_name' },
    bio:                  { type: DataTypes.TEXT,        defaultValue: '' },
    avatarUrl:            { type: DataTypes.TEXT,        field: 'avatar_url' },
    location:             { type: DataTypes.STRING(120) },
    isPrivate:            { type: DataTypes.BOOLEAN, defaultValue: false,  field: 'is_private' },
    twoFactorEnabled:     { type: DataTypes.BOOLEAN, defaultValue: false,  field: 'two_factor_enabled' },
    showSalesPublicly:    { type: DataTypes.BOOLEAN, defaultValue: true,   field: 'show_sales_publicly' },
    emailOnNewFollower:   { type: DataTypes.BOOLEAN, defaultValue: false,  field: 'email_on_new_follower' },
  },
  {
    tableName:  'users',
    underscored: true,
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
  }
);

// ---------------------------------------------------------------------------
// Follow  (join table for self-referential many-to-many)
// ---------------------------------------------------------------------------
const Follow = sequelize.define(
  'Follow',
  {
    followerId: { type: DataTypes.UUID, field: 'follower_id', primaryKey: true },
    followeeId: { type: DataTypes.UUID, field: 'followee_id', primaryKey: true },
  },
  { tableName: 'follows', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// PaymentMethod
// ---------------------------------------------------------------------------
const PaymentMethod = sequelize.define(
  'PaymentMethod',
  {
    id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId:     { type: DataTypes.UUID, field: 'user_id', allowNull: false },
    type:       { type: DataTypes.ENUM('UPI', 'QR_CODE'), allowNull: false },
    upiId:      { type: DataTypes.STRING(120), field: 'upi_id' },
    qrCodeUrl:  { type: DataTypes.TEXT, field: 'qr_code_url' },
    isDefault:  { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_default' },
  },
  { tableName: 'payment_methods', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// Artwork
// The `metadata` JSONB column holds all AI/flexible fields:
//   { ai_tags: string[], ai_generated_description: string|null, style_embedding: number[]|null }
// ---------------------------------------------------------------------------
const Artwork = sequelize.define(
  'Artwork',
  {
    id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerId:     { type: DataTypes.UUID, field: 'owner_id', allowNull: false },
    title:       { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    price:       { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency:    { type: DataTypes.STRING(3), defaultValue: 'USD' },
    category:    {
      type: DataTypes.ENUM('Painting','Textile','Illustration','Photography','Sculpture','Digital'),
      allowNull: false,
    },
    imageUrl:    { type: DataTypes.TEXT, field: 'image_url', allowNull: false },
    status:      {
      type: DataTypes.ENUM('available', 'sold', 'archived'),
      defaultValue: 'available',
    },
    likeCount:   { type: DataTypes.INTEGER, defaultValue: 0, field: 'like_count' },
    // JSONB — read/write as a plain JS object; Sequelize serialises automatically.
    metadata:    { type: DataTypes.JSONB, defaultValue: {} },
  },
  {
    tableName:  'artworks',
    underscored: true,
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
  }
);

// Convenience getters / setters so callers can use artwork.aiTags, etc.
Artwork.prototype.getAiTags = function () {
  return (this.metadata && this.metadata.ai_tags) || [];
};
Artwork.prototype.getAiGeneratedDescription = function () {
  return (this.metadata && this.metadata.ai_generated_description) || null;
};

// ---------------------------------------------------------------------------
// Like  (join table: artworks ↔ users)
// ---------------------------------------------------------------------------
const Like = sequelize.define(
  'Like',
  {
    artworkId: { type: DataTypes.UUID, field: 'artwork_id', primaryKey: true },
    userId:    { type: DataTypes.UUID, field: 'user_id',    primaryKey: true },
  },
  { tableName: 'likes', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// Comment
// ---------------------------------------------------------------------------
const Comment = sequelize.define(
  'Comment',
  {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    artworkId: { type: DataTypes.UUID, field: 'artwork_id', allowNull: false },
    userId:    { type: DataTypes.UUID, field: 'user_id',    allowNull: false },
    text:      { type: DataTypes.TEXT, allowNull: false },
  },
  { tableName: 'comments', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------
const Collection = sequelize.define(
  'Collection',
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerId:       { type: DataTypes.UUID, field: 'owner_id', allowNull: false },
    name:          { type: DataTypes.STRING(120), allowNull: false },
    coverImageUrl: { type: DataTypes.TEXT, field: 'cover_image_url' },
  },
  {
    tableName:  'collections',
    underscored: true,
    timestamps: true,
    createdAt:  'created_at',
    updatedAt:  'updated_at',
  }
);

// ---------------------------------------------------------------------------
// CollectionArtwork  (ordered join table: collections ↔ artworks)
// ---------------------------------------------------------------------------
const CollectionArtwork = sequelize.define(
  'CollectionArtwork',
  {
    collectionId: { type: DataTypes.UUID, field: 'collection_id', primaryKey: true },
    artworkId:    { type: DataTypes.UUID, field: 'artwork_id',    primaryKey: true },
    position:     { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'collection_artworks', underscored: true, timestamps: true, updatedAt: false, createdAt: 'added_at' }
);

// ---------------------------------------------------------------------------
// Activity  (notification feed)
// ---------------------------------------------------------------------------
const Activity = sequelize.define(
  'Activity',
  {
    id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recipientId: { type: DataTypes.UUID, field: 'recipient_id', allowNull: false },
    actorId:     { type: DataTypes.UUID, field: 'actor_id',     allowNull: false },
    type:        { type: DataTypes.ENUM('like', 'comment', 'follow', 'sale'), allowNull: false },
    artworkId:   { type: DataTypes.UUID, field: 'artwork_id' },
    commentId:   { type: DataTypes.UUID, field: 'comment_id' },
    amountCents: { type: DataTypes.INTEGER, field: 'amount_cents' },
    read:        { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: 'activities', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------
const Transaction = sequelize.define(
  'Transaction',
  {
    id:            { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    artworkId:     { type: DataTypes.UUID, field: 'artwork_id',   allowNull: false },
    sellerId:      { type: DataTypes.UUID, field: 'seller_id',    allowNull: false },
    buyerId:       { type: DataTypes.UUID, field: 'buyer_id',     allowNull: false },
    amountCents:   { type: DataTypes.INTEGER, field: 'amount_cents', allowNull: false },
    currency:      { type: DataTypes.STRING(3), defaultValue: 'USD' },
    paymentMethod: { type: DataTypes.ENUM('UPI', 'QR_CODE'), field: 'payment_method', allowNull: false },
    status:        {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending',
    },
  },
  { tableName: 'transactions', underscored: true, timestamps: true, updatedAt: false, createdAt: 'created_at' }
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

// Users ↔ Follows (self-referential many-to-many)
User.belongsToMany(User, { through: Follow, as: 'followers',  foreignKey: 'followeeId', otherKey: 'followerId' });
User.belongsToMany(User, { through: Follow, as: 'following',  foreignKey: 'followerId', otherKey: 'followeeId' });

// Users ↔ PaymentMethods
User.hasMany(PaymentMethod, { foreignKey: 'userId' });
PaymentMethod.belongsTo(User, { foreignKey: 'userId' });

// Users ↔ Artworks
User.hasMany(Artwork, { foreignKey: 'ownerId', as: 'artworks' });
Artwork.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

// Artworks ↔ Likes (many-to-many via Like join)
Artwork.belongsToMany(User, { through: Like, as: 'likedBy', foreignKey: 'artworkId', otherKey: 'userId' });
User.belongsToMany(Artwork, { through: Like, as: 'likedArtworks', foreignKey: 'userId', otherKey: 'artworkId' });

// Artworks ↔ Comments
Artwork.hasMany(Comment, { foreignKey: 'artworkId', as: 'comments' });
Comment.belongsTo(Artwork, { foreignKey: 'artworkId' });
User.hasMany(Comment, { foreignKey: 'userId' });
Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' });

// Collections ↔ Artworks (ordered many-to-many)
Collection.belongsToMany(Artwork, { through: CollectionArtwork, foreignKey: 'collectionId', otherKey: 'artworkId', as: 'artworks' });
Artwork.belongsToMany(Collection, { through: CollectionArtwork, foreignKey: 'artworkId', otherKey: 'collectionId', as: 'collections' });
User.hasMany(Collection, { foreignKey: 'ownerId', as: 'collections' });
Collection.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

// Activities
Activity.belongsTo(User,    { foreignKey: 'actorId',     as: 'actor' });
Activity.belongsTo(User,    { foreignKey: 'recipientId', as: 'recipient' });
Activity.belongsTo(Artwork, { foreignKey: 'artworkId',   as: 'artwork' });
Activity.belongsTo(Comment, { foreignKey: 'commentId',   as: 'comment' });

// Transactions
User.hasMany(Transaction, { foreignKey: 'sellerId', as: 'sales' });
User.hasMany(Transaction, { foreignKey: 'buyerId',  as: 'purchases' });
Transaction.belongsTo(User,    { foreignKey: 'sellerId', as: 'seller' });
Transaction.belongsTo(User,    { foreignKey: 'buyerId',  as: 'buyer' });
Transaction.belongsTo(Artwork, { foreignKey: 'artworkId', as: 'artwork' });
Artwork.hasMany(Transaction,   { foreignKey: 'artworkId', as: 'transactions' });

module.exports = {
  sequelize,
  User,
  Follow,
  PaymentMethod,
  Artwork,
  Like,
  Comment,
  Collection,
  CollectionArtwork,
  Activity,
  Transaction,
};
