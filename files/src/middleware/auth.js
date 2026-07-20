const { verifyToken } = require('../services/auth');
const { User } = require('../models');

/**
 * Builds the GraphQL context for each request: attaches the authenticated
 * user (if any) so resolvers can check `context.user`.
 */
async function buildContext({ req }) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { user: null };

  const payload = verifyToken(token);
  if (!payload) return { user: null };

  const user = await User.findByPk(payload.sub);
  return { user };
}

function requireAuth(context) {
  if (!context.user) {
    const err = new Error('Not authenticated');
    err.extensions = { code: 'UNAUTHENTICATED' };
    throw err;
  }
  return context.user;
}

module.exports = { buildContext, requireAuth };
