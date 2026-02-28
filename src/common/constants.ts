export const jwtConstants = {
  secret: process.env.JWT_SECRET_AUTH ?? 'change-me-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN ?? 604800,
};
