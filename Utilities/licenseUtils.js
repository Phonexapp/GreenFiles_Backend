const admin = require("../firebase/firebase");

const db = admin.database();
const licenseRef = db.ref("licenses");

const getLicenseByLicenseId  = async (requestedLicenseId) => {
  const snapshot = await licenseRef
    .orderByChild("licenseId")
    .equalTo(Number(requestedLicenseId))
    .once("value");
  return snapshot.val();
};
const updateLicense = async (licenseId, updatedLicense) => {
  await licenseRef.child(licenseId).update(updatedLicense);
};
const deleteLicense = async (licenseId) => {
  await licenseRef.child(licenseId).remove();
};
module.exports = {
  getLicenseByLicenseId,
  updateLicense,
  deleteLicense,
};