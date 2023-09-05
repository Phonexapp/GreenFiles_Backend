const admin = require("../firebase/firebase");

const db = admin.database();

const companiesRef = db.ref("companies");

async function getCompanyByCompanyId(requestedCompanyId) {
  const snapshot = await companiesRef
    .orderByChild("companyId")
    .equalTo(Number(requestedCompanyId))
    .once("value");

  return snapshot.val();
}

async function updateCompany(companyId, updatedCompany) {
  await companiesRef.child(companyId).update(updatedCompany);
}

const deleteCompany = async (companyId) => {
  await companiesRef.child(companyId).remove();
};

module.exports = {
  getCompanyByCompanyId,
  updateCompany,
  deleteCompany,
};
