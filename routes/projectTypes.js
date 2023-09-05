const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getProjectTypeByTypeId,
  updateProjectType,
} = require("../Utilities/projectTypesUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const projectTypesRef = db.ref("projectTypes");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: error.message });
};

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;

    const projectTypesSnapshot = await projectTypesRef.once("value");
    const projectTypesObject = projectTypesSnapshot.val();
    const projectTypes = Object.values(projectTypesObject);

    const totalPages = Math.ceil(projectTypes.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedProjectTypes = projectTypes.slice(startIndex, endIndex);

    const formattedProjectTypes = paginatedProjectTypes.map((type) => ({
      ...type,
      lastUpdate: formatDateAndTime(type.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      projectTypes: formattedProjectTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

router.post("/", async (req, res) => {
  try {
    const { projectTypeName } = req.body;
    const projectTypesSnapshot = await projectTypesRef.once("value");

    let nextProjectTypeId = 1;
    projectTypesSnapshot.forEach((childSnapshot) => {
      const projectTypeId = childSnapshot.val().projectTypeId;
      nextProjectTypeId = Math.max(nextProjectTypeId, projectTypeId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newProjectType = {
        projectTypeId: nextProjectTypeId,
        projectTypeName,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingTypeSnapshot = await projectTypesRef
        .orderByChild("projectTypeId")
        .equalTo(nextProjectTypeId)
        .once("value");

      if (!existingTypeSnapshot.exists()) {
        const projectTypeRef = projectTypesRef.child(String(nextProjectTypeId));
        await projectTypeRef.set(newProjectType);

        const response = {
          result: "OK",
          projectTypeId: nextProjectTypeId,
          projectType: newProjectType,
        };

        res.status(201).json(response);
        break;
      }

      nextProjectTypeId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

router.put("/:projectTypeId", async (req, res) => {
  try {
    const requestedProjectTypeId = req.params.projectTypeId;
    const updatedProjectType = req.body;

    if ("projectTypeId" in updatedProjectType) {
      res.status(400).json({ message: "Cannot update projectTypeId" });
      return;
    }

    updatedProjectType.lastUpdate = formatDateAndTime(new Date());
    updatedProjectType.updatedBy = DEFAULT_USER_EMAIL;

    const projectTypeDetails = await getProjectTypeByTypeId(
      requestedProjectTypeId
    );

    if (projectTypeDetails) {
      const projectTypeId = Object.keys(projectTypeDetails)[0];
      await updateProjectType(projectTypeId, updatedProjectType);

      const updatedResponseProjectType = {
        ...updatedProjectType,
        projectTypeId: parseInt(projectTypeId),
      };

      res.status(200).json({
        result: "OK",
        projectType: updatedResponseProjectType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

router.get("/:projectTypeId", async (req, res) => {
  try {
    const requestedProjectTypeId = req.params.projectTypeId;
    const projectTypeDetails = await getProjectTypeByTypeId(
      requestedProjectTypeId
    );

    if (projectTypeDetails) {
      const projectTypeId = Object.keys(projectTypeDetails)[0];
      const formattedProjectType = {
        projectTypeId: parseInt(projectTypeId),
        ...projectTypeDetails[projectTypeId],
        lastUpdate: formatDateAndTime(
          projectTypeDetails[projectTypeId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        projectType: formattedProjectType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete project by projectId
router.delete("/:projectTypeId", async (req, res) => {
  try {
    const requestedProjectTypeId = req.params.projectTypeId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const projectTypeDetails = await getProjectTypeByTypeId(
      requestedProjectTypeId
    );

    if (projectTypeDetails) {
      const projectTypeId = Object.keys(projectTypeDetails)[0];
      const actualLastUpdate = projectTypeDetails[projectTypeId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the project type as inactive and update necessary fields
      const updatedProjectType = {
        ...projectTypeDetails[projectTypeId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateProjectType(projectTypeId, updatedProjectType);

      // Prepare the response projectType object
      const responseProjectType = {
        projectTypeId: parseInt(projectTypeId),
        ...updatedProjectType,
      };

      res.status(200).json({
        result: "OK",
        projectType: responseProjectType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
