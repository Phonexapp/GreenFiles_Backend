const admin = require("../firebase/firebase");

const db = admin.database();
const specialEducationsRef = db.ref("specialEducations");

const getSpecialEducationById = async (requestedSpecialEducationId) => {
  const snapshot = await specialEducationsRef
    .orderByChild("specialEducationId")
    .equalTo(Number(requestedSpecialEducationId))
    .once("value");

  return snapshot.val();
};

const updateSpecialEducation = async (
  specialEducationId,
  updatedSpecialEducation
) => {
  await specialEducationsRef
    .child(specialEducationId)
    .update(updatedSpecialEducation);
};

const deleteSpecialEducation = async (specialEducationId) => {
  await specialEducationsRef.child(specialEducationId).remove();
};

module.exports = {
  getSpecialEducationById,
  updateSpecialEducation,
  deleteSpecialEducation,
};
