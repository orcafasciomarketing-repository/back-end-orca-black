const { Schema, model } = require("mongoose");

const { MANAGE_SEGMENTS, ROLES } = require("../../../config/roles");

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    // Usuários criados antes dos perfis não têm o campo: o default faz eles
    // continuarem admin (o mongoose aplica o default ao ler do banco)
    role: {
      type: String,
      enum: ROLES,
      default: "admin",
    },
    // Só nos perfis de colaborador: a pessoa que essa conta representa
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendors",
    },
    sdrId: {
      type: Schema.Types.ObjectId,
      ref: "SDR",
    },
    // Só no perfil admin: o setor cujas metas ele gerencia (cadastro e o que os vendedores veem). Ele continua
    // vendo tudo. Sem o campo, gerencia todos
    manageSegment: {
      type: String,
      enum: MANAGE_SEGMENTS,
    },
  },
  { timestamps: true },
);

module.exports = model("User", UserSchema);
