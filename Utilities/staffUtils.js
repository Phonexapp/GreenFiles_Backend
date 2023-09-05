const admin = require("../firebase/firebase");

const db = admin.database();
const staffsRef = db.ref("staffs");

// Function to retrieve staff member by staffId
const getStaffById = async (requestedStaffId) => {
  const staffSnapshot = await staffRef.child(requestedStaffId).once("value");
  return staffSnapshot.val();
};

// Function to update staff member in the database
const updateStaff = async (staffId, updatedStaff) => {
  await staffRef.child(staffId).update(updatedStaff);
};

const deleteStaff = async (staffId) => {
  await staffsRef.child(staffId).remove();
};

module.exports = {
  getStaffById,
  updateStaff,
  deleteStaff,
};
