const jwt = require("jsonwebtoken");

// impersonatedBy: o id do master que abriu o "acessar como" (só nesse token; não existe refresh desse acesso)
function createAccessToken({ id, email, impersonatedBy }) {
  const payload = { userId: id, userEmail: email, ...(impersonatedBy && { impersonatedBy: String(impersonatedBy) }) };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "60m" });
}

exports.generateAccessToken = (userData) => {
  return createAccessToken(userData);
};

exports.verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
