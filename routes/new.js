const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const dotenv = require("dotenv");
dotenv.config();

const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS) || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Database references
const staffRef = admin.database().ref("staff");

const collections = {
  jobCategories: admin.database().ref("jobCategories"),
  officialPositions: admin.database().ref("officialPositions"),
  specialEducations: admin.database().ref("specialEducations"),
  skillTrainings: admin.database().ref("skillTrainings"),
  companies: admin.database().ref("companies"),
  licenses: admin.database().ref("licenses"),
};

// Link collection data by IDs
async function linkCollectionByIds(ids, collectionRef) {
  const linkedData = [];

  try {
    for (const id of ids || []) {
      if (id !== undefined) {
        const snapshot = await collectionRef.child(id).once("value");

        if (snapshot.exists()) {
          linkedData.push(snapshot.val());
        } else {
          console.error(`Data not found for ID: ${id}`);
        }
      }
    }
  } catch (error) {
    console.error("Error linking collection data:", error);
  }

  return linkedData;
}

// Error handler function
function errorHandler(res, error) {
  console.error(error);
  res.status(500).json({ error: "An error occurred" });
}

// Create a new staff member
router.post("/", async (req, res, next) => {
  try {
    const staffData = req.body;

    const staffIdSnapshot = await staffRef
      .orderByChild("staffId")
      .limitToLast(1)
      .once("value");
    let nextStaffId = 1;

    staffIdSnapshot.forEach((childSnapshot) => {
      nextStaffId = childSnapshot.val().staffId + 1;
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newStaffId = nextStaffId;
      const currentDate = new Date();

      const snapshot = await staffRef.child(newStaffId).once("value");
      if (!snapshot.exists()) {
        const linkedCollections = {};

        for (const [name, ref] of Object.entries(collections)) {
          linkedCollections[name] = await linkCollectionByIds(
            staffData[name],
            ref
          );
        }

        const staffWithLinkedCollections = {
          ...staffData,
          ...linkedCollections,
          staffId: newStaffId,
          lastUpdate: formatDateAndTime(currentDate),
          updatedBy: DEFAULT_USER_EMAIL,
          isActive: true,
        };

        await staffRef.child(newStaffId).set(staffWithLinkedCollections);

        const responseStaff = {
          ...staffWithLinkedCollections,
          experiencedProjectTypes:
            staffWithLinkedCollections.experiencedProjectTypes.map(
              (projectType) => ({
                projectTypeId: projectType.projectTypeId,
                ignorable: projectType.ignorable,
              })
            ),
        };

        return res.status(201).json({
          result: "OK",
          staffId: newStaffId,
          staff: responseStaff,
        });
      }

      nextStaffId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      return res.status(500).json({ message: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Get staff members with query parameters
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";
    const staffId = parseInt(req.query.staff_id) || null;
    const dailyReportStaffId =
      parseInt(req.query.daily_report_staff_id) || null;
    const staffName = req.query.staff_name || "";

    const staffSnapshot = await staffRef.once("value");
    const staffData = staffSnapshot.val();

    console.log("Total staff members:", staffData.length);

    let filteredStaff = Object.values(staffData);

    console.log("Initial filtered staff count:", filteredStaff.length);

    if (activeOnly) {
      filteredStaff = filteredStaff.filter((staff) => staff.isActive);
    }

    console.log("After activeOnly filter:", filteredStaff.length);

    if (staffId !== null) {
      filteredStaff = filteredStaff.filter((staff) => staff.id === staffId);
    }

    console.log("After staffId filter:", filteredStaff.length);

    if (dailyReportStaffId !== null) {
      filteredStaff = filteredStaff.filter(
        (staff) => staff.dailyReportStaffId === dailyReportStaffId
      );
    }

    console.log("After dailyReportStaffId filter:", filteredStaff.length);

    if (staffName !== "") {
      filteredStaff = filteredStaff.filter((staff) =>
        staff.name.includes(staffName)
      );
    }

    console.log("After staffName filter:", filteredStaff.length);

    const totalItems = filteredStaff.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedStaff = filteredStaff.slice(startIndex, endIndex);

    const formattedStaff = paginatedStaff.map((staff) => ({
      ...staff,
      hireDate: formatDateAndTime(staff.hireDate),
    }));

    res.status(200).json({
      result: "OK",
      staff: formattedStaff,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Get a specific staff member by staffId
router.get("/:staffId", async (req, res, next) => {
  try {
    const { staffId } = req.params;

    // Fetch staff member data by ID
    const snapshot = await staffRef.child(staffId).once("value");
    const staffMember = snapshot.val();

    // If staff member does not exist, return a 404 response
    if (!staffMember) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    const linkedCollections = {};

    for (const [name, ref] of Object.entries(collections)) {
      const data = staffMember[name];

      if (Array.isArray(data)) {
        const ids = data.map((item) => item[`${name.slice(0, -1)}Id`]);
        linkedCollections[name] = await linkCollectionByIds(ids, ref);
      } else {
        console.error(`Invalid data for ${name}`);
      }
    }

    const staffResponse = {
      result: "OK",
      staffs: [
        {
          ...staffMember,
          ...linkedCollections,
        },
      ],
    };

    return res.status(200).json(staffResponse);
  } catch (error) {
    // Consider using a dedicated error handling middleware
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Update a staff member by staffId
router.put("/:staffId", async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const updatedStaff = req.body;

    // Update the lastUpdate and updatedBy fields before updating
    updatedStaff.lastUpdate = formatDateAndTime(new Date());
    updatedStaff.updatedBy = DEFAULT_USER_EMAIL;

    // Update the staff member data in the database
    await staffRef.child(staffId).update(updatedStaff);

    // Construct the response object based on the provided structure
    const response = {
      result: "OK",
      staff: {
        ...updatedStaff,
        lastUpdate: updatedStaff.lastUpdate,
        updatedBy: updatedStaff.updatedBy,
      },
      // licenses: linkedCollections.licenses,
      // licenseTypes: linkedCollections.licenseTypes,
      // attachedDocuments: [],
      // documentTypes: [],
      // specialEducations: [],
      // skillTrainings: [],
      // jobCategories: [],
      // officialPositions: [],
      // companies: [],
      // projects: [],
      // projectTypes: linkedCollections.projectTypes,
      // transfers: [],
    };

    // Send the response
    res.status(200).json(response);
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete a staff member by staffId
router.delete("/:staffId", async (req, res, next) => {
  try {
    const { staffId } = req.params;
    await staffRef.child(staffId).remove();
    res.status(204).send();
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
