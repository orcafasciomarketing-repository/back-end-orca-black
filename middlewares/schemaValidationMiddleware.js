const { ValidationError } = require("../shared/errors");

exports.validateSchema = (schema) => (req, res, next) => {
  try {
    const data = req.body;

    const validationData = schema.safeParse(data);

    if (!validationData.success) {
      throw ValidationError(validationData.error.issues[0].message);
    }

    req.data = validationData.data;

    next();
  } catch (err) {
    next(err);
  }
};
