const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getLicenseTypeById,
  updateLicenseType,
} = require("../Utilities/licenseTypesUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const licenseTypesRef = db.ref("licenseTypes");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active license types filtering
const filterActiveLicenseTypes = (types, activeOnly) => {
  if (activeOnly) {
    return types.filter((type) => type.isActive);
  }
  return types;
};

// Get all license types
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const licenseTypesSnapshot = await licenseTypesRef.once("value");
    const licenseTypes = licenseTypesSnapshot.val();

    const filteredLicenseTypes = filterActiveLicenseTypes(
      Object.values(licenseTypes),
      activeOnly
    );
    const totalPages = Math.ceil(filteredLicenseTypes.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedLicenseTypes = filteredLicenseTypes.slice(
      startIndex,
      endIndex
    );
    const formattedLicenseTypes = paginatedLicenseTypes.map((type) => ({
      ...type,
      lastUpdate: formatDateAndTime(type.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      licenseTypes: formattedLicenseTypes,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new License Type
router.post("/", async (req, res) => {
  try {
    const { licenseName } = req.body;

    const licenseTypesSnapshot = await licenseTypesRef.once("value");

    let nextLicenseTypeId = 1;

    licenseTypesSnapshot.forEach((childSnapshot) => {
      const licenseTypeId = childSnapshot.val().licenseTypeId;
      nextLicenseTypeId = Math.max(nextLicenseTypeId, licenseTypeId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newLicenseType = {
        licenseTypeId: nextLicenseTypeId,
        licenseName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingTypeSnapshot = await licenseTypesRef
        .orderByChild("licenseTypeId")
        .equalTo(nextLicenseTypeId)
        .once("value");

      if (!existingTypeSnapshot.exists()) {
        const licenseTypeRef = licenseTypesRef.child(String(nextLicenseTypeId));
        await licenseTypeRef.set(newLicenseType);

        const response = {
          result: "OK",
          licenseTypeId: nextLicenseTypeId,
          licenseType: newLicenseType,
        };

        res.status(201).json(response);
        break;
      }

      nextLicenseTypeId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update license type by licenseTypeId
router.put("/:licenseTypeId", async (req, res) => {
  try {
    const requestedLicenseTypeId = req.params.licenseTypeId;
    const updatedLicenseType = req.body;

    if ("licenseTypeId" in updatedLicenseType) {
      res.status(400).json({ message: "Cannot update licenseTypeId" });
      return;
    }

    const now = new Date();
    updatedLicenseType.lastUpdate = formatDateAndTime(now);
    updatedLicenseType.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const licenseTypeDetails = await getLicenseTypeById(requestedLicenseTypeId);

    if (licenseTypeDetails) {
      const licenseTypeId = Object.keys(licenseTypeDetails)[0];
      await updateLicenseType(licenseTypeId, updatedLicenseType);

      const updatedResponseLicenseType = {
        ...updatedLicenseType,
        licenseTypeId: parseInt(licenseTypeId),
      };

      res.status(200).json({
        result: "OK",
        licenseType: updatedResponseLicenseType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "License type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve license type by licenseTypeId
router.get("/:licenseTypeId", async (req, res) => {
  try {
    const requestedLicenseTypeId = req.params.licenseTypeId;
    const licenseTypeDetails = await getLicenseTypeById(requestedLicenseTypeId);

    if (licenseTypeDetails) {
      const licenseTypeId = Object.keys(licenseTypeDetails)[0];
      const formattedLicenseType = {
        licenseTypeId: parseInt(licenseTypeId),
        ...licenseTypeDetails[licenseTypeId],
        lastUpdate: formatDateAndTime(
          licenseTypeDetails[licenseTypeId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        licenseType: formattedLicenseType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "License type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete license type by licenseTypeId
router.delete("/:licenseTypeId", async (req, res) => {
  try {
    const requestedLicenseTypeId = req.params.licenseTypeId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const licenseTypeSnapshot = await licenseTypesRef
      .orderByChild("licenseTypeId")
      .equalTo(Number(requestedLicenseTypeId))
      .once("value");

    const licenseTypeData = licenseTypeSnapshot.val();

    if (licenseTypeData) {
      const licenseTypeId = Object.keys(licenseTypeData)[0];
      const actualLastUpdate = licenseTypeData[licenseTypeId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the license type as inactive and update necessary fields
      const updatedLicenseType = {
        ...licenseTypeData[licenseTypeId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateLicenseType(licenseTypeId, updatedLicenseType);

      // Prepare the response licenseType object
      const responseLicenseType = {
        licenseTypeId: parseInt(licenseTypeId),
        ...updatedLicenseType,
      };

      res.status(200).json({
        result: "OK",
        licenseType: responseLicenseType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "License type not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
