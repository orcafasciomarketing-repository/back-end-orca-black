const authService = require("../service/authService");

// Em produção o front e o back ficam em domínios diferentes: o navegador só manda
// o cookie entre domínios com sameSite "none", e "none" exige secure (https)
const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
});

function setRefreshTokenCookie(res, refreshToken, expiration) {
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions(),
    expires: new Date(expiration),
  });
}

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

exports.logoutUser = async (req, res) => {
  await authService.logoutUser(req.cookies?.refreshToken);
  res.clearCookie("refreshToken", cookieOptions());
  res.status(200).json({ success: true, message: "Sessão encerrada" });
};

exports.impersonate = async (req, res) => {
  const { user, token } = await authService.impersonate(req.user, req.params.id);
  console.log(`[acessar como] ${req.user.email} entrou como ${user.email}`);
  res.status(200).json({ user, token });
};

exports.changePassword = async (req, res) => {
  const { user, token, refreshToken, expiration } = await authService.changePassword(req.user.id, req.data);
  setRefreshTokenCookie(res, refreshToken, expiration);
  res.status(200).json({ user, token, message: "Senha alterada" });
};
