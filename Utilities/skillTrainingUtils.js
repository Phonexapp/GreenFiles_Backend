const admin = require("../firebase/firebase");

const db = admin.database();

const skillTrainingsRef = db.ref("skillTrainings");

const getSkillTrainingById = async (requestedSkillTrainingId) => {
  const snapshot = await skillTrainingsRef
    .orderByChild("skillTrainingId")
    .equalTo(Number(requestedSkillTrainingId))
    .once("value");

  return snapshot.val();
};

const updateSkillTraining = async (skillTrainingId, updatedSkillTraining) => {
  await skillTrainingsRef.child(skillTrainingId).update(updatedSkillTraining);
};

const deleteSkillTraining = async (skillTrainingId) => {
  await skillTrainingsRef.child(skillTrainingId).remove();
};

module.exports = {
  getSkillTrainingById,
  updateSkillTraining,
  deleteSkillTraining,
};
