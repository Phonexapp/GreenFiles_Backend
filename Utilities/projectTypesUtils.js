const admin = require("../firebase/firebase");

const db = admin.database();

const projectTypesRef = db.ref("projectTypes");

const getProjectTypeByTypeId = async (requestedProjectTypeId) => {
  const snapshot = await projectTypesRef
    .orderByChild("projectTypeId")
    .equalTo(Number(requestedProjectTypeId))
    .once("value");

  return snapshot.val();
};

const updateProjectType = async (projectTypeId, updatedProjectType) => {
  await projectTypesRef.child(projectTypeId).update(updatedProjectType);
};

const deleteProjectType = async (projectTypeId) => {
  await projectTypesRef.child(projectTypeId).remove();
};

module.exports = {
  getProjectTypeByTypeId,
  updateProjectType,
  deleteProjectType,
};
