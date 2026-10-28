const authService = require("../service/authService");

// Em produção o front e o back ficam em domínios diferentes: o navegador só manda
// o cookie entre domínios com sameSite "none", e "none" exige secure (https)
const isProduction = process.env.NODE_ENV === "production";

function setRefreshTokenCookie(res, refreshToken, expiration) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
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
