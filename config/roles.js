// Perfis gravados no usuário. O "master" não é gravado: é quem tem o e-mail da
// variável MASTER_EMAIL (só ele importa vendas, vê os erros e edita/exclui usuários)
const ROLES = ["admin", "b2b", "b2g", "vendor", "sdr"];

// Perfis de colaborador: cada conta fica ligada a um vendedor (vendorId) ou a uma
// pessoa de passagem (sdrId) e só enxerga a própria área (/me), nunca o admin
const PERSON_ROLES = { vendor: "vendorId", sdr: "sdrId" };

const isPersonRole = (role) => Object.hasOwn(PERSON_ROLES, role);

const MASTER_EMAIL = (process.env.MASTER_EMAIL ?? "").trim().toLowerCase();

// Perfil que vale para as permissões. Sem perfil gravado (usuário antigo) = admin.
// Sem MASTER_EMAIL configurado, todo admin vale como master, como era antes
const getUserRole = (user) => {
  const role = user.role ?? "admin";
  if (!MASTER_EMAIL) return role === "admin" ? "master" : role;
  return user.email === MASTER_EMAIL ? "master" : role;
};

const isMasterEmail = (email) => !!MASTER_EMAIL && email === MASTER_EMAIL;

// Setor que cada perfil enxerga: master e admin veem todos (null), b2b e b2g só o próprio setor
const getRoleSegment = (role) => (role === "b2b" || role === "b2g" ? role : null);

module.exports = { ROLES, PERSON_ROLES, isPersonRole, getUserRole, isMasterEmail, getRoleSegment };
