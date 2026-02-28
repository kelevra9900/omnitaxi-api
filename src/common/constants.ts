export const jwtConstants = {
  secret:
    process.env.JWT_SECRET_AUTH ??
    'ZEWJ9LtUnTgFPV9BENY264/ivrW4CgaPxcb+qbAi6FIw5LdrBk/BZpqcCTB+Vd+D',
  expiresIn: process.env.JWT_EXPIRES_IN ?? 604800,
};
