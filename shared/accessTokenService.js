const jwt = require("jsonwebtoken");

function createAccessToken({ id, email }) {
  return jwt.sign({ userId: id, userEmail: email }, process.env.JWT_SECRET, { expiresIn: "60m" });
}

exports.generateAccessToken = (userData) => {
  return createAccessToken(userData);
};

exports.verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};
