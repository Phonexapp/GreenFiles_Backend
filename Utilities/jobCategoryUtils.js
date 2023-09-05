const admin = require("../firebase/firebase");

const db = admin.database();
const jobCategoriesRef = db.ref("jobCategories");

const getJobCategoryByCategoryId = async (requestedJobCategoryId) => {
  const snapshot = await jobCategoriesRef
    .orderByChild("jobCategoryId")
    .equalTo(Number(requestedJobCategoryId))
    .once("value");

  return snapshot.val();
};

const updateJobCategory = async (jobCategoryId, updatedJobCategory) => {
  await jobCategoriesRef.child(jobCategoryId).update(updatedJobCategory);
};

const deleteJobCategory = async (jobCategoryId) => {
  await jobCategoriesRef.child(jobCategoryId).remove();
};

module.exports = {
  getJobCategoryByCategoryId,
  updateJobCategory,
  deleteJobCategory,
};
