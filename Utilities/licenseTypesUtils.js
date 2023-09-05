const admin = require("../firebase/firebase");

const db = admin.database();

const licenseTypesRef = db.ref("licenseTypes");

const getLicenseTypeById = async (requestedLicenseTypeId) => {
  const snapshot = await licenseTypesRef
    .orderByChild("licenseTypeId")
    .equalTo(Number(requestedLicenseTypeId))
    .once("value");

  return snapshot.val();
};

const updateLicenseType = async (licenseTypeId, updatedLicenseType) => {
  await licenseTypesRef.child(licenseTypeId).update(updatedLicenseType);
};

const deleteLicenseType = async (licenseTypeId) => {
  await licenseTypesRef.child(licenseTypeId).remove();
};

module.exports = {
  getLicenseTypeById,
  updateLicenseType,
  deleteLicenseType,
};
