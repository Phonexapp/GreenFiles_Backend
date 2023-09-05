const admin = require("../firebase/firebase");

const db = admin.database();
const officialPositionsRef = db.ref("officialPositions");

const getOfficialPositionByPositionId = async (requestedOfficialPositionId) => {
  const snapshot = await officialPositionsRef
    .orderByChild("officialPositionId")
    .equalTo(Number(requestedOfficialPositionId))
    .once("value");

  return snapshot.val();
};

const updateOfficialPosition = async (
  officialPositionId,
  updatedOfficialPosition
) => {
  await officialPositionsRef
    .child(officialPositionId)
    .update(updatedOfficialPosition);
};

const deleteOfficialPosition = async (officialPositionId) => {
  await officialPositionsRef.child(officialPositionId).remove();
};

module.exports = {
  getOfficialPositionByPositionId,
  updateOfficialPosition,
  deleteOfficialPosition,
};
