const pointsMap = new Map([
  ["sales", Number(process.env.POINTS_PER_SALE ?? 0)],
  ["farm", Number(process.env.POINTS_PER_FARM ?? 0)],
  ["passage", Number(process.env.POINTS_PER_PASSAGE ?? 0)],
]);

module.exports = { pointsMap };
