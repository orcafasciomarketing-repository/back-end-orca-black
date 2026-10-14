const authService = require("../service/authService");

function setRefreshTokenCookie(res, refreshToken, expiration) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(expiration),
  });
}

exports.registerUser = async (req, res) => {
  const validatedData = req.data;
  const { user, token, refreshToken, expiration } = await authService.registerUser(validatedData);
  setRefreshTokenCookie(res, refreshToken, expiration);
  res.status(201).json({ user, token });
};

exports.loginUser = async (req, res) => {
  const validatedData = req.data;
  const { user, token, refreshToken, expiration } = await authService.loginUser(validatedData);
  setRefreshTokenCookie(res, refreshToken, expiration);
  res.status(200).json({ user, token });
};

exports.refreshUserTokens = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const { token, refreshToken: newRefreshToken, expiration, user } = await authService.refreshUserTokens(refreshToken);
  setRefreshTokenCookie(res, newRefreshToken, expiration);
  res.status(200).json({ user, token });
};
