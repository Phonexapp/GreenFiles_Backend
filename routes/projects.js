const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getProjectByProjectId,
  updateProject,
} = require("../Utilities/projectsUtils");

const dotenv = require("dotenv");
dotenv.config();
// Reference to the Firebase Realtime Database
const db = admin.database();
const projectTypesRef = db.ref("projectTypes");
const projectsRef = db.ref("projects");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active projects filtering
const filterActiveProjects = (projects, activeOnly) => {
  if (activeOnly) {
    return projects.filter((project) => project.isActive);
  }
  return projects;
};

// GET /projects
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";
    const projectId = parseInt(req.query.project_id) || null;
    const projectName = req.query.project_name || null;
    const projectTypeId = parseInt(req.query.project_type_id) || null;

    const projectsSnapshot = await projectsRef.once("value");
    const projects = projectsSnapshot.val();

    let filteredProjects = Object.values(projects);

    filteredProjects = filterActiveProjects(filteredProjects, activeOnly);

    if (projectId !== null) {
      filteredProjects = filteredProjects.filter(
        (project) => project.projectId === projectId
      );
    }

    if (projectName !== null) {
      filteredProjects = filteredProjects.filter((project) =>
        project.projectName.toLowerCase().includes(projectName.toLowerCase())
      );
    }

    if (projectTypeId !== null) {
      filteredProjects = filteredProjects.filter(
        (project) => project.projectTypeId === projectTypeId
      );
    }

    const totalPages = Math.ceil(filteredProjects.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

    const formattedProjects = paginatedProjects.map((project) => ({
      projectId: project.projectId,
      dailyReportProjectId: project.dailyReportProjectId,
      projectName: project.projectName,
      projectTypeId: project.projectTypeId,
      isActive: project.isActive,
      lastUpdate: formatDateAndTime(project.lastUpdate),
      updatedBy: project.updatedBy,
    }));

    const projectTypesSnapshot = await projectTypesRef.once("value");
    const projectTypes = projectTypesSnapshot.val();

    const formattedProjectTypes = Object.values(projectTypes).map((type) => ({
      projectTypeId: type.projectTypeId,
      projectTypeName: type.projectTypeName,
      lastUpdate: formatDateAndTime(type.lastUpdate),
      updatedBy: type.updatedBy,
    }));

    res.status(200).json({
      result: "OK",
      projects: formattedProjects,
      projectTypes: formattedProjectTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Project
router.post("/", async (req, res) => {
  try {
    const { dailyReportProjectId, projectName, projectTypeId } = req.body;

    const projectsSnapshot = await projectsRef.once("value");

    let nextProjectId = 1;

    projectsSnapshot.forEach((childSnapshot) => {
      const existingProjectId = childSnapshot.val().projectId;
      nextProjectId = Math.max(nextProjectId, existingProjectId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newProject = {
        projectId: nextProjectId,
        dailyReportProjectId,
        projectName,
        projectTypeId,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingProjectSnapshot = await projectsRef
        .orderByChild("projectId")
        .equalTo(nextProjectId)
        .once("value");

      if (!existingProjectSnapshot.exists()) {
        const projectRef = projectsRef.child(String(nextProjectId));
        await projectRef.set(newProject);

        const projectTypeSnapshot = await projectTypesRef
          .child(String(projectTypeId))
          .once("value");
        const projectType = projectTypeSnapshot.val();

        const response = {
          result: "OK",
          projectId: nextProjectId,
          project: {
            projectId: nextProjectId,
            dailyReportProjectId,
            projectName,
            projectTypeId,
            isActive: newProject.isActive,
            lastUpdate: formatDateAndTime(newProject.lastUpdate),
            updatedBy: newProject.updatedBy,
          },
          projectType: {
            projectTypeId: projectType.projectTypeId,
            projectTypeName: projectType.projectTypeName,
            lastUpdate: formatDateAndTime(projectType.lastUpdate),
            updatedBy: projectType.updatedBy,
          },
        };

        res.status(201).json(response);
        break;
      }

      nextProjectId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

// Update project by projectId
router.put("/:projectId", async (req, res) => {
  try {
    const requestedProjectId = req.params.projectId;
    const updatedProject = req.body;

    // Prevent updating projectId directly
    if ("projectId" in updatedProject) {
      res.status(400).json({ message: "Cannot update projectId" });
      return;
    }

    // Adding lastUpdate and updatedBy to the updatedProject object
    const now = new Date();
    updatedProject.lastUpdate = formatDateAndTime(now);
    updatedProject.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const projectDetails = await getProjectByProjectId(requestedProjectId);

    if (projectDetails) {
      const projectKey = Object.keys(projectDetails)[0];
      await updateProject(projectKey, updatedProject);

      // Prepare the updated project object for response
      const updatedResponseProject = {
        ...updatedProject,
        projectId: parseInt(requestedProjectId),
      };

      const projectTypeSnapshot = await projectTypesRef
        .child(String(updatedProject.projectTypeId))
        .once("value");
      const projectType = projectTypeSnapshot.val();

      res.status(200).json({
        result: "OK",
        project: updatedResponseProject,
        projectType: {
          projectTypeId: projectType.projectTypeId,
          projectTypeName: projectType.projectTypeName,
          lastUpdate: formatDateAndTime(projectType.lastUpdate),
          updatedBy: projectType.updatedBy,
        },
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve project by projectId
router.get("/:projectId", async (req, res) => {
  try {
    const requestedProjectId = req.params.projectId;
    const projectDetails = await getProjectByProjectId(requestedProjectId);

    if (projectDetails) {
      const projectKey = Object.keys(projectDetails)[0];
      const formattedProject = {
        projectId: parseInt(requestedProjectId),
        ...projectDetails[projectKey],
        lastUpdate: formatDateAndTime(projectDetails[projectKey].lastUpdate),
      };

      const projectTypeId = projectDetails[projectKey].projectTypeId;

      const projectTypeSnapshot = await projectTypesRef
        .child(String(projectTypeId))
        .once("value");
      const projectType = projectTypeSnapshot.val();

      res.status(200).json({
        result: "OK",
        project: formattedProject,
        projectType: {
          projectTypeId: projectType.projectTypeId,
          projectTypeName: projectType.projectTypeName,
          lastUpdate: formatDateAndTime(projectType.lastUpdate),
          updatedBy: projectType.updatedBy,
        },
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

router.delete("/:projectId", async (req, res) => {
  try {
    const requestedProjectId = req.params.projectId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const projectDetails = await getProjectByProjectId(requestedProjectId);

    if (projectDetails) {
      const projectKey = Object.keys(projectDetails)[0];
      const actualLastUpdate = projectDetails[projectKey].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the project as inactive and update necessary fields
      const updatedProject = {
        ...projectDetails[projectKey],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      await updateProject(projectKey, updatedProject);

      // Get the project type details
      const projectTypeId = projectDetails[projectKey].projectTypeId;
      const projectTypeSnapshot = await projectTypesRef
        .child(String(projectTypeId))
        .once("value");
      const projectType = projectTypeSnapshot.val();

      // Prepare the response objects
      const responseProject = {
        projectId: parseInt(requestedProjectId),
        ...updatedProject,
      };

      const responseProjectType = {
        projectTypeId: projectType.projectTypeId,
        projectTypeName: projectType.projectTypeName,
        lastUpdate: formatDateAndTime(projectType.lastUpdate),
        updatedBy: projectType.updatedBy,
      };

      res.status(200).json({
        result: "OK",
        project: responseProject,
        projectType: responseProjectType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Project not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
