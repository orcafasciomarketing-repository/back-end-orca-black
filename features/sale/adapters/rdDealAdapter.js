exports.translateRdObject = (rawObject, stageMap) => {
  const formattedObject = {
    rdDealId: rawObject.document.id,
    rdDealName: rawObject.document.name,
    value: rawObject.document.amount_total,
    dealStageId: rawObject.document.deal_stage?.id,
    rdUpdatedAt: new Date(rawObject.document.updated_at),
    rdUserId: rawObject.document.user.id,
    rdSdrName: true,
  };

  const classification = stageMap[formattedObject.dealStageId];

  formattedObject.isBlackFriday = !!classification;

  const finalObject = { ...formattedObject, ...classification };

  return finalObject;
};
