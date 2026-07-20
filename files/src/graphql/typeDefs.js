const { gql } = require('graphql-tag');

const typeDefs = gql`
  scalar JSON

  type User {
    id: ID!
    username: String!
    email: String!
    displayName: String!
    bio: String
    avatarUrl: String
    location: String
    isPrivate: Boolean!
    followerCount: Int!
    followingCount: Int!
    artzCount: Int!
    isFollowedByMe: Boolean!
    paymentMethods: [PaymentMethod!]!
  }

  type PaymentMethod {
    id: ID!
    type: PaymentMethodType!
    upiId: String
    qrCodeUrl: String
    isDefault: Boolean!
  }

  enum PaymentMethodType {
    UPI
    QR_CODE
  }

  type Artwork {
    id: ID!
    owner: User!
    title: String!
    description: String
    price: Float!
    currency: String!
    category: Category!
    imageUrl: String!
    aiTags: [String!]!
    aiGeneratedDescription: String
    likeCount: Int!
    likedByMe: Boolean!
    status: ArtworkStatus!
    createdAt: String!
  }

  enum Category {
    Painting
    Textile
    Illustration
    Photography
    Sculpture
    Digital
  }

  enum ArtworkStatus {
    available
    sold
    archived
  }

  type Collection {
    id: ID!
    name: String!
    artworks: [Artwork!]!
    coverImageUrl: String
    createdAt: String!
  }

  type Activity {
    id: ID!
    type: ActivityType!
    actor: User!
    artwork: Artwork
    commentText: String
    amountCents: Int
    read: Boolean!
    createdAt: String!
  }

  enum ActivityType {
    like
    comment
    follow
    sale
  }

  type Transaction {
    id: ID!
    artwork: Artwork!
    seller: User!
    buyer: User!
    amountCents: Int!
    currency: String!
    paymentMethod: PaymentMethodType!
    status: TransactionStatus!
    createdAt: String!
  }

  enum TransactionStatus {
    pending
    completed
    failed
    refunded
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Query {
    me: User
    user(username: String!): User
    myArtz: [Artwork!]!
    userArtz(username: String!): [Artwork!]!
    artwork(id: ID!): Artwork
    searchArtz(query: String!): [Artwork!]!
    recommendedArtz(artworkId: ID!): [Artwork!]!
    myCollections: [Collection!]!
    myActivity(unreadOnly: Boolean = false): [Activity!]!
    myTransactions: [Transaction!]!
  }

  input CreateArtworkInput {
    title: String!
    description: String
    price: Float!
    category: Category!
    imageUrl: String!
    aiTags: [String!]
    generateDescription: Boolean = false
  }

  input UpdateArtworkInput {
    title: String
    description: String
    price: Float
    category: Category
    imageUrl: String
    aiTags: [String!]
  }

  input UpdatePaymentMethodInput {
    type: PaymentMethodType!
    upiId: String
    qrCodeUrl: String
  }

  type Mutation {
    signup(username: String!, email: String!, password: String!, displayName: String!): AuthPayload!
    login(identifier: String!, password: String!): AuthPayload!

    updateProfile(displayName: String, bio: String, avatarUrl: String, location: String): User!
    updatePrivacySettings(
      isPrivate: Boolean
      twoFactorEnabled: Boolean
      showSalesPublicly: Boolean
      emailOnNewFollower: Boolean
    ): User!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    follow(username: String!): User!
    unfollow(username: String!): User!

    createArtz(input: CreateArtworkInput!): Artwork!
    updateArtz(id: ID!, input: UpdateArtworkInput!): Artwork!
    deleteArtz(id: ID!): Boolean!
    toggleLike(artworkId: ID!): Artwork!
    commentOnArtz(artworkId: ID!, text: String!): Activity!

    createCollection(name: String!): Collection!
    addToCollection(collectionId: ID!, artworkId: ID!): Collection!
    removeFromCollection(collectionId: ID!, artworkId: ID!): Collection!

    upsertPaymentMethod(input: UpdatePaymentMethodInput!): PaymentMethod!
    recordSale(artworkId: ID!, buyerUsername: String!, paymentMethod: PaymentMethodType!): Transaction!

    markActivityRead(activityId: ID!): Activity!
    markAllActivityRead: Boolean!
  }

  type Subscription {
    activityReceived: Activity!
    artworkLiked(artworkId: ID!): Artwork!
  }
`;

module.exports = typeDefs;
