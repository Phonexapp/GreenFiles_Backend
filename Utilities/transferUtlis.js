const admin = require("../firebase/firebase");

const db = admin.database();
const transfersRef = db.ref("transfers");

const getTransferByTransferId = async (requestedTransferId) => {
  const snapshot = await transfersRef
    .orderByChild("transferId")
    .equalTo(Number(requestedTransferId))
    .once("value");
  return snapshot.val();
};

const updateTransfer = async (transferId, updatedTransfer) => {
  await transfersRef.child(transferId).update(updatedTransfer);
};

const deleteTransfer = async (transferId) => {
  await transfersRef.child(transferId).remove();
};

module.exports = {
  getTransferByTransferId,
  updateTransfer,
  deleteTransfer,
};
