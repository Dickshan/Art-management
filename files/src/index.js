require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@as-integrations/express5');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { makeExecutableSchema } = require('@graphql-tools/schema');

const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { buildContext } = require('./middleware/auth');
const { verifyToken } = require('./services/auth');
const { connectPostgres } = require('./config/postgres');
const { redis } = require('./config/redis');
const { upload, uploadDir, urlFor } = require('./services/upload');
const { User } = require('./models');

async function start() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
  app.use('/uploads', express.static(uploadDir));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // REST endpoint for the upload flow: the frontend runs TensorFlow.js in the
  // browser to extract tags from the image *before* calling this, then sends
  // both the file and the tags together. The GraphQL `createArtz` mutation
  // then takes the returned imageUrl + tags.
  app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
    res.json({ imageUrl: urlFor(req.file.filename), tags });
  });

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // --- WebSocket transport for GraphQL subscriptions (realtime activity/likes) ---
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const token = ctx.connectionParams?.authorization?.replace('Bearer ', '');
        if (!token) return { user: null };
        const payload = verifyToken(token);
        if (!payload) return { user: null };
        const user = await User.findByPk(payload.sub);
        return { user };
      },
    },
    wsServer
  );

  const apollo = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });
  await apollo.start();

  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(apollo, { context: buildContext })
  );

  await connectPostgres();
  // simple readiness ping — throws if redis isn't reachable
  await redis.ping();
  console.log('[redis] ping ok');

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`THE ARTZ API ready:`);
    console.log(`  GraphQL   → http://localhost:${PORT}/graphql`);
    console.log(`  WS subs   → ws://localhost:${PORT}/graphql`);
    console.log(`  Uploads   → http://localhost:${PORT}/api/upload (POST, multipart)`);
    console.log(`  Health    → http://localhost:${PORT}/health`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
