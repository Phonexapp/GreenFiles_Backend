const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const { getStaffById, updateStaff } = require("../Utilities/staffUtils");
const dotenv = require("dotenv");
dotenv.config();

const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS) || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Database references
const staffRef = admin.database().ref("staff");

// Error handler function
function errorHandler(res, error) {
  console.error(error);
  res.status(500).json({ error: "An error occurred" });
}

const collections = {
  jobCategories: admin.database().ref("jobCategories"),
  companies: admin.database().ref("companies"),
  officialPositions: admin.database().ref("officialPositions"),
  specialEducations: admin.database().ref("specialEducations"),
  skillTrainings: admin.database().ref("skillTrainings"),
  licenses: admin.database().ref("licenses"),
  projects: admin.database().ref("projects"),
  linceseTypes: admin.database().ref("linceseTypes"),
};

// Link collection data by IDs
async function linkCollectionByIds(ids, collectionRef) {
  const linkedData = [];

  // console.log("ids", ids, "collectionRef", collectionRef);

  try {
    for (const id of ids || []) {
      if (id !== undefined) {
        const snapshot = await collectionRef.child(id).once("value");
        // console.log(snapshot);
        if (snapshot.exists()) {
          // console.log(snapshot.exists());
          linkedData.push(snapshot.val());
          // console.log(snapshot.val());
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

// Function to fetch and format objects from linked collections
async function fetchLinkedCollections(updatedStaff) {
  const linkedCollections = {};

  // Replace these with actual functions to fetch objects from collections by ID
  linkedCollections.jobCategories = await fetchObjectsByIds(
    "jobCategories",
    updatedStaff.jobCategories
  );
  linkedCollections.licenses = await fetchObjectsByIds(
    "licenses",
    updatedStaff.licenses
  );
  linkedCollections.specialEducations = await fetchObjectsByIds(
    "specialEducations",
    updatedStaff.specialEducations
  );
  linkedCollections.skillTrainings = await fetchObjectsByIds(
    "skillTrainings",
    updatedStaff.skillTrainings
  );
  linkedCollections.companies = await fetchObjectsByIds(
    "companies",
    updatedStaff.companies
  );
  linkedCollections.officialPositions = await fetchObjectsByIds(
    "officialPositions",
    updatedStaff.officialPositions
  );
  linkedCollections.projects = await fetchObjectsByIds(
    "projects",
    updatedStaff.projects
  );

  return linkedCollections;
}

// Function to fetch objects from a collection by IDs
async function fetchObjectsByIds(collectionName, ids) {
  try {
    if (!Array.isArray(ids)) {
      throw new Error("ids must be an array");
    }

    const objects = [];

    for (const id of ids) {
      const snapshot = await staffRef
        .child(collectionName)
        .child(id)
        .once("value");
      const object = snapshot.val();
      if (object) {
        objects.push(object);
      }
    }

    return objects;
  } catch (error) {
    console.error(`Error fetching objects from ${collectionName}:`, error);
    throw error;
  }
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
    const companyId = parseInt(req.query.company_id) || null;
    const dailyReportStaffId =
      parseInt(req.query.daily_report_staff_id) || null;
    const staffName = req.query.staff_name || "";
    const includeCompanies = req.query.companies === "true";
    const includeLicenses = req.query.licenses === "true";
    const includeAttachedDocuments = req.query.attached_documents === "true";
    const includeSpecialEducations = req.query.special_educations === "true";
    const includeSkillTrainings = req.query.skill_trainings === "true";
    const includeJobCategories = req.query.job_categories === "true";
    const includeOfficialPositions = req.query.official_positions === "true";
    const includeProjects = req.query.projects === "true";

    const staffSnapshot = await staffRef.once("value");
    const staffData = staffSnapshot.val();

    // Convert staffData into an array of staff objects
    const staffArray = Object.values(staffData);

    // Apply filters
    let filteredStaff = staffArray;

    if (activeOnly) {
      filteredStaff = filteredStaff.filter((staff) => staff.isActive);
    }

    if (staffId !== null) {
      filteredStaff = filteredStaff.filter(
        (staff) => staff.staffId === staffId
      );
    }

    if (companyId !== null) {
      filteredStaff = filteredStaff.filter(
        (staff) => staff.companyId === companyId
      );
    }

    if (dailyReportStaffId !== null) {
      filteredStaff = filteredStaff.filter(
        (staff) => staff.dailyReportStaffId === dailyReportStaffId
      );
    }

    if (staffName !== "") {
      const lowercaseStaffName = staffName.toLowerCase();

      filteredStaff = filteredStaff.filter((staff) =>
        staff.staffName.toLowerCase().includes(lowercaseStaffName)
      );
    }

    // Extract additional data based on query parameters
    if (includeCompanies) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        companies: staff.companies,
      }));
    } else {
      // If "includeCompanies" is not true, remove companies from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { companies, ...rest } = staff;
        return rest;
      });
    }

    // Extract licenses if "includeLicenses" is true
    if (includeLicenses) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        licenses: staff.licenses,
      }));
    } else {
      // If "includeLicenses" is not true, remove licenses from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { licenses, ...rest } = staff;
        return rest;
      });
    }

    // Extract attached documents if "includeAttachedDocuments" is true
    if (includeAttachedDocuments) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        attachedDocuments: staff.attachedDocuments,
        documentTypes: staff.documentTypes,
      }));
    } else {
      // If "includeAttachedDocuments" is not true, remove attached documents from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { attachedDocuments, documentTypes, ...rest } = staff;
        return rest;
      });
    }

    // Extract special educations if "includeSpecialEducations" is true
    if (includeSpecialEducations) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        specialEducations: staff.specialEducations,
      }));
    } else {
      // If "includeSpecialEducations" is not true, remove special educations from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { specialEducations, ...rest } = staff;
        return rest;
      });
    }

    // Extract skill trainings if "includeSkillTrainings" is true
    if (includeSkillTrainings) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        skillTrainings: staff.skillTrainings,
      }));
    } else {
      // If "includeSkillTrainings" is not true, remove skill trainings from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { skillTrainings, ...rest } = staff;
        return rest;
      });
    }

    // Extract job categories if "includeJobCategories" is true
    if (includeJobCategories) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        jobCategories: staff.jobCategories,
      }));
    } else {
      // If "includeJobCategories" is not true, remove job categories from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { jobCategories, ...rest } = staff;
        return rest;
      });
    }

    // Extract official positions if "includeOfficialPositions" is true
    if (includeOfficialPositions) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        officialPositions: staff.officialPositions,
      }));
    } else {
      // If "includeOfficialPositions" is not true, remove official positions from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { officialPositions, ...rest } = staff;
        return rest;
      });
    }

    // Extract projects if "includeProjects" is true
    if (includeProjects) {
      filteredStaff = filteredStaff.map((staff) => ({
        ...staff,
        projects: staff.projects,
      }));
    } else {
      // If "includeProjects" is not true, remove projects from the response
      filteredStaff = filteredStaff.map((staff) => {
        const { projects, ...rest } = staff;
        return rest;
      });
    }

    const totalItems = filteredStaff.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedStaff = filteredStaff.slice(startIndex, endIndex);

    const formattedStaff = paginatedStaff.map((staff) => ({
      ...staff,
    }));

    res.status(200).json({
      result: "OK",
      staffs: formattedStaff,
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
        // console.log(ids);

        if (!ids.includes(undefined)) {
          linkedCollections[name] = await linkCollectionByIds(ids, ref);
        }
        // console.log(linkedCollections);
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

    // Fetch and format the objects from collections based on their IDs
    const linkedCollections = await fetchLinkedCollections(updatedStaff);

    // Construct the response object with objects from linkedCollections
    const response = {
      result: "OK",
      staff: {
        ...updatedStaff,
        lastUpdate: updatedStaff.lastUpdate,
        updatedBy: updatedStaff.updatedBy,
      },
    };

    // Send the response
    res.status(200).json(response);
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete a staff member by staffId
router.delete("/:staffId", async (req, res) => {
  try {
    const requestedStaffId = req.params.staffId;
    const providedLastUpdate = req.body.lastUpdate;

    // Check if lastUpdate field is provided
    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    // Retrieve staff details from the database
    const staffDetails = await getStaffById(requestedStaffId);

    // Check if staff member exists
    if (staffDetails) {
      const actualLastUpdate = staffDetails.lastUpdate;

      // Check if provided lastUpdate matches actual lastUpdate
      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Update isActive to false in the database
      const updatedStaff = {
        ...staffDetails,
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      // Perform the update in the database
      await updateStaff(requestedStaffId, updatedStaff);

      // Prepare the response staff object
      const responseStaff = {
        staffId: requestedStaffId,
        ...updatedStaff,
      };

      res.status(200).json({
        result: "OK",
        staff: responseStaff,
      });
    } else {
      // Staff member not found
      res.status(404).json({ result: "NG", message: "Staff not found" });
    }
  } catch (error) {
    // Handle server error
    res.status(500).json({ result: "NG", error: error.message });
  }
});

module.exports = router;
