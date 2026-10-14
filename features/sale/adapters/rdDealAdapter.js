exports.translateRdObject = (rawObject, stageMap, passageFieldId) => {
  const formattedObject = {
    rdDealId: rawObject.document.id,
    rdDealName: rawObject.document.name,
    value: rawObject.document.amount_total,
    dealStageId: rawObject.document.deal_stage?.id,
    rdUpdatedAt: new Date(rawObject.document.updated_at),
    rdUserId: rawObject.document.user.id,
  };

  const classification = stageMap[formattedObject.dealStageId];
  const isWon = rawObject.document.status === "won";

  // Na etapa Blackfriday (qualquer status): os dados da venda são atualizados
  formattedObject.isBlackFridayStage = !!classification;
  // Na etapa e ganho: venda válida (ativa)
  formattedObject.isBlackFriday = !!classification && isWon;

  // Passagem: select com o nome da pessoa. Sem o campo ou com value null → sem passagem
  const passageField = rawObject.document.deal_custom_fields?.find(
    (field) => field.custom_field?.id === passageFieldId,
  );

  formattedObject.rdPassageName = passageField?.value || null;

  const finalObject = { ...formattedObject, ...classification };

  return finalObject;
};
