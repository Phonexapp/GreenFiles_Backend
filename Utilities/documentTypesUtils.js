const admin = require("../firebase/firebase");

const db = admin.database();
const documentTypesRef = db.ref("documentTypes");

const getDocumentTypeById = async (requestedDocumentTypeId) => {
  const snapshot = await documentTypesRef
    .orderByChild("documentTypeId")
    .equalTo(Number(requestedDocumentTypeId))
    .once("value");

  return snapshot.val();
};

const updateDocumentType = async (documentTypeId, updatedDocumentType) => {
  await documentTypesRef.child(documentTypeId).update(updatedDocumentType);
};

const deleteDocumentType = async (documentTypeId) => {
  await documentTypesRef.child(documentTypeId).remove();
};

module.exports = {
  getDocumentTypeById,
  updateDocumentType,
  deleteDocumentType,
};
