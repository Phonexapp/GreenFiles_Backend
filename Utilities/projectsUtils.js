const admin = require("../firebase/firebase");

const db = admin.database();
const projectsRef = db.ref("projects");

const getProjectByProjectId = async (requestedProjectId) => {
  const snapshot = await projectsRef
    .orderByChild("projectId")
    .equalTo(Number(requestedProjectId))
    .once("value");

  return snapshot.val();
};

const updateProject = async (projectId, updatedProject) => {
  await projectsRef.child(projectId).update(updatedProject);
};

const deleteProject = async (projectId) => {
  await projectsRef.child(projectId).remove();
};

module.exports = {
  getProjectByProjectId,
  updateProject,
  deleteProject,
};
