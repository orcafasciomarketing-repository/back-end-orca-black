// Perfis fixos de acesso ao admin. As telas das TVs continuam públicas
const ROLES = ["admin", "b2b", "b2g"];

// Setor que cada perfil enxerga: o admin vê todos (null), b2b e b2g só o próprio setor
const getRoleSegment = (role) => (role === "b2b" || role === "b2g" ? role : null);

module.exports = { ROLES, getRoleSegment };
