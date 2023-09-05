const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getTransferByTransferId,
  updateTransfer,
} = require("../Utilities/transferUtlis");

const dotenv = require("dotenv");
dotenv.config();

// Reference to the Firebase Realtime Database
const db = admin.database();
const projectTypesRef = db.ref("projectTypes");
const projectsRef = db.ref("projects");
const transfersRef = db.ref("transfers");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active projects filtering
const filterActiveTransfers = (projects, activeOnly) => {
  if (activeOnly) {
    return projects.filter((project) => project.isActive);
  }
  return projects;
};

router.post("/", async (req, res) => {
  try {
    const {
      staffId,
      moveOutProject,
      moveInProject,
      isHomeProject,
      isActiveProject,
      scheduledMovingDate,
      entranceDate,
      movedDate,
      scheduledLeavingDate,
      leftDate,
    } = req.body;

    const projectsSnapshot = await projectsRef.once("value");
    const transfersSnapshot = await transfersRef.once("value");
    const projectTypesSnapshot = await projectTypesRef.once("value");

    let nextTransferId = 1;

    transfersSnapshot.forEach((childSnapshot) => {
      const existingTransferId = childSnapshot.val().transferId;
      nextTransferId = Math.max(nextTransferId, existingTransferId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newTransfer = {
        transferId: nextTransferId,
        staffId,
        moveOutProject,
        moveInProject,
        isHomeProject,
        isActiveProject,
        scheduledMovingDate,
        entranceDate,
        movedDate,
        scheduledLeavingDate,
        leftDate,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingTransferSnapshot = await transfersRef
        .orderByChild("transferId")
        .equalTo(nextTransferId)
        .once("value");

      if (!existingTransferSnapshot.exists()) {
        const transferRef = transfersRef.child(String(nextTransferId));
        await transferRef.set(newTransfer);

        const responseProjects = [];
        projectsSnapshot.forEach((projectSnapshot) => {
          const projectData = projectSnapshot.val();
          responseProjects.push({
            projectId: projectData.projectId,
            dailyReportProjectId: projectData.dailyReportProjectId,
            projectName: projectData.projectName,
            projectTypeId: projectData.projectTypeId,
            isActive: projectData.isActive,
            lastUpdate: formatDateAndTime(projectData.lastUpdate),
            updatedBy: projectData.updatedBy,
          });
        });

        const responseProjectTypes = [];
        projectTypesSnapshot.forEach((typeSnapshot) => {
          const projectType = typeSnapshot.val();
          responseProjectTypes.push({
            projectTypeId: projectType.projectTypeId,
            projectTypeName: projectType.projectTypeName,
            lastUpdate: formatDateAndTime(projectType.lastUpdate),
            updatedBy: projectType.updatedBy,
          });
        });

        const response = {
          result: "OK",
          transferId: nextTransferId,
          transfer: {
            staffId,
            transferId: nextTransferId,
            moveOutProject,
            moveInProject,
            isHomeProject,
            isActiveProject,
            scheduledMovingDate,
            entranceDate,
            movedDate,
            scheduledLeavingDate,
            leftDate,
            isActive: newTransfer.isActive,
            lastUpdate: formatDateAndTime(newTransfer.lastUpdate),
            updatedBy: newTransfer.updatedBy,
          },
          projects: responseProjects,
          projectTypes: responseProjectTypes,
        };

        res.status(201).json(response);
        break;
      }

      nextTransferId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    console.error(error); // Log the error
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";
    const staffId = req.query.staffId !== null;

    const transfersSnapshot = await transfersRef.once("value");
    const transfers = transfersSnapshot.val();

    let filteredTransfers = Object.values(transfers);

    filteredTransfers = filterActiveTransfers(filteredTransfers, activeOnly);

    const totalPages = Math.ceil(filteredTransfers.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedTransfer = filteredTransfers.slice(startIndex, endIndex);

    const formattedTransfers = paginatedTransfer.map((transfer) => ({
      staffId: transfer.staffId,
      transferId: transfer.transferId,
      moveOutProject: transfer.moveOutProject,
      moveInProject: transfer.moveInProject,
      isHomeProject: transfer.isHomeProject,
      isActiveProject: transfer.isActiveProject,
      scheduledMovingDate: transfer.scheduledMovingDate,
      entranceDate: transfer.entranceDate,
      movedDate: transfer.movedDate,
      scheduledLeavingDate: transfer.scheduledLeavingDate,
      leftDate: transfer.leftDate,
      isActive: transfer.isActive,
      lastUpdate: formatDateAndTime(transfer.lastUpdate),
      updatedBy: transfer.updatedBy,
    }));
    const projectsSnapshot = await projectsRef.once("value");
    const projects = projectsSnapshot.val();

    const formattedProjects = Object.values(projects).map((project) => ({
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
      transfers: formattedTransfers,
      projects: formattedProjects,
      projectTypes: formattedProjectTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

router.put("/:transferId", async (req, res) => {
  try {
    const requestedTransferId = parseInt(req.params.transferId);
    const updatedTransfer = req.body;

    // Prevent updating transferId directly
    if ("transferId" in updatedTransfer) {
      res.status(400).json({ message: "Cannot update transferId" });
      return;
    }

    // Adding lastUpdate and updatedBy to the updatedTransfer object
    const now = new Date();
    updatedTransfer.lastUpdate = formatDateAndTime(now);
    updatedTransfer.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const transferDetails = await getTransferByTransferId(requestedTransferId);

    if (transferDetails) {
      const transferKey = Object.keys(transferDetails)[0];
      await updateTransfer(transferKey, updatedTransfer);

      // Prepare the updated transfer object for response
      const updatedResponseTransfer = {
        ...updatedTransfer,
        transferId: requestedTransferId,
      };

      const projectsSnapshot = await projectsRef.once("value");
      const projectTypesSnapshot = await projectTypesRef.once("value");

      const responseProjects = [];
      projectsSnapshot.forEach((projectSnapshot) => {
        const projectData = projectSnapshot.val();
        responseProjects.push({
          projectId: projectData.projectId,
          dailyReportProjectId: projectData.dailyReportProjectId,
          projectName: projectData.projectName,
          projectTypeId: projectData.projectTypeId,
          isActive: projectData.isActive,
          lastUpdate: formatDateAndTime(projectData.lastUpdate),
          updatedBy: projectData.updatedBy,
        });
      });

      const responseProjectTypes = [];
      projectTypesSnapshot.forEach((typeSnapshot) => {
        const projectType = typeSnapshot.val();
        responseProjectTypes.push({
          projectTypeId: projectType.projectTypeId,
          projectTypeName: projectType.projectTypeName,
          lastUpdate: formatDateAndTime(projectType.lastUpdate),
          updatedBy: projectType.updatedBy,
        });
      });

      res.status(200).json({
        result: "OK",
        transfer: updatedResponseTransfer,
        projects: responseProjects,
        projectTypes: responseProjectTypes,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Transfer not found" });
    }
  } catch (error) {
    console.error(error); // Log the error
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

router.get("/:transferId", async (req, res) => {
  try {
    const transferId = parseInt(req.params.transferId);

    const transfersSnapshot = await transfersRef.once("value");
    const transfers = transfersSnapshot.val();

    if (!transfers) {
      return res
        .status(404)
        .json({ result: "NG", message: "Transfers not found" });
    }

    const transfer = Object.values(transfers).find(
      (transfer) => transfer.transferId === transferId
    );

    if (!transfer) {
      return res
        .status(404)
        .json({ result: "NG", message: "Transfer not found" });
    }

    const formattedTransfer = {
      staffId: transfer.staffId,
      transferId: transfer.transferId,
      isHomeProject: transfer.isHomeProject,
      isActiveProject: transfer.isActiveProject,
      scheduledMovingDate: transfer.scheduledMovingDate,
      entranceDate: transfer.entranceDate,
      movedDate: transfer.movedDate,
      scheduledLeavingDate: transfer.scheduledLeavingDate,
      leftDate: transfer.leftDate,
      isActive: transfer.isActive,
      lastUpdate: formatDateAndTime(transfer.lastUpdate),
      updatedBy: transfer.updatedBy,
    };

    const projectsSnapshot = await projectsRef.once("value");
    const projects = projectsSnapshot.val();

    const formattedProjects = Object.values(projects).map((project) => ({
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
      transfer: formattedTransfer,
      projects: formattedProjects,
      projectTypes: formattedProjectTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

router.delete("/:transferId", async (req, res) => {
  try {
    const requestedTransferId = parseInt(req.params.transferId);
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const transferDetails = await getTransferByTransferId(requestedTransferId);

    if (transferDetails) {
      const transferKey = Object.keys(transferDetails)[0];
      const actualLastUpdate = transferDetails[transferKey].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the transfer as inactive and update necessary fields
      const updatedTransfer = {
        ...transferDetails[transferKey],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      await updateTransfer(transferKey, updatedTransfer);

      /* const projectsSnapshot = await projectsRef.once("value");
      const projectTypesSnapshot = await projectTypesRef.once("value");

      const responseProjects = [];
      projectsSnapshot.forEach((projectSnapshot) => {
        const projectData = projectSnapshot.val();
        responseProjects.push({
          projectId: projectData.projectId,
          dailyReportProjectId: projectData.dailyReportProjectId,
          projectName: projectData.projectName,
          projectTypeId: projectData.projectTypeId,
          isActive: projectData.isActive,
          lastUpdate: formatDateAndTime(projectData.lastUpdate),
          updatedBy: projectData.updatedBy,
        });
      });*/

      /*const responseProjectTypes = [];
      projectTypesSnapshot.forEach((typeSnapshot) => {
        const projectType = typeSnapshot.val();
        responseProjectTypes.push({
          projectTypeId: projectType.projectTypeId,
          projectTypeName: projectType.projectTypeName,
          lastUpdate: formatDateAndTime(projectType.lastUpdate),
          updatedBy: projectType.updatedBy,
        });
      });*/

      res.status(200).json({
        result: "OK",
        transfer: {
          transferId: requestedTransferId,
          ...updatedTransfer,
        },
        // projects: responseProjects,
        // projectTypes: responseProjectTypes,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Transfer not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
