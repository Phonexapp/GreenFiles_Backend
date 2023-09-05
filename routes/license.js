const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getLicenseByLicenseId,
  updateLicense,
} = require("../Utilities/licenseUtils");

const dotenv = require("dotenv");
dotenv.config();
// Reference to the Firebase Realtime Database
const db = admin.database();
const licenseTypesRef = db.ref("licenseTypes");
const licensesRef = db.ref("licenses");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active licenses filtering
const filterActiveLicenses = (licenses, activeOnly) => {
  if (activeOnly) {
    return licenses.filter((license) => license.isActive);
  }
  return licenses;
};

router.post("/", async (req, res) => {
  try {
    const { staffId, licenseNumber, expiryDate, licenseTypeId } = req.body;

    const licensesSnapshot = await licensesRef.once("value");

    let nextLicenseId = 1;

    licensesSnapshot.forEach((childSnapshot) => {
      const existingLicenseId = childSnapshot.val().licenseId;
      nextLicenseId = Math.max(nextLicenseId, existingLicenseId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newLicense = {
        licenseId: nextLicenseId,
        staffId,
        licenseNumber,
        expiryDate,
        licenseTypeId,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingLicenseSnapshot = await licensesRef
        .orderByChild("licenseId")
        .equalTo(nextLicenseId)
        .once("value");

      if (!existingLicenseSnapshot.exists()) {
        const licenseRef = licensesRef.child(String(nextLicenseId));
        await licenseRef.set(newLicense);

        const licenseTypeSnapshot = await licenseTypesRef
          .child(String(licenseTypeId))
          .once("value");
        const licenseType = licenseTypeSnapshot.val();

        const response = {
          result: "OK",
          licenseId: nextLicenseId,
          license: {
            licenseId: nextLicenseId,
            staffId,
            licenseNumber,
            expiryDate,
            licenseTypeId,
            isActive: newLicense.isActive,
            lastUpdate: formatDateAndTime(newLicense.lastUpdate),
            updatedBy: newLicense.updatedBy,
          },
          licenseType: {
            licenseTypeId: licenseType.licenseTypeId,
            licenseTypeName: licenseType.licenseTypeName,
            lastUpdate: formatDateAndTime(licenseType.lastUpdate),
            updatedBy: licenseType.updatedBy,
          },
        };

        res.status(201).json(response);
        break;
      }

      nextLicenseId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";
    const staffIds = req.query.staff_id
      ? Array.from(new Set(req.query.staff_id.split(",")))
      : null;
    const licenseTypeId = parseInt(req.query.license_type_id) || null;

    const licensesSnapshot = await licensesRef.once("value");
    const licenses = licensesSnapshot.val();

    let filteredLicenses = Object.values(licenses);

    filteredLicenses = filterActiveLicenses(
      filteredLicenses,
      activeOnly,
      staffIds
    );

    if (staffIds !== null) {
      filteredLicenses = filteredLicenses.filter((license) =>
        staffIds.includes(String(license.staffId))
      );
    }

    if (licenseTypeId !== null) {
      filteredLicenses = filteredLicenses.filter(
        (license) => license.licenseTypeId === licenseTypeId
      );
    }

    const totalPages = Math.ceil(filteredLicenses.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedLicenses = filteredLicenses.slice(startIndex, endIndex);

    const licenseTypeIds = paginatedLicenses.map(
      (license) => license.licenseTypeId
    );

    const licenseTypesSnapshot = await licenseTypesRef.once("value");
    const licenseTypes = licenseTypesSnapshot.val();

    const formattedlicenseTypes = Object.values(licenseTypes)
      .filter((type) => licenseTypeIds.includes(type.licenseTypeId))
      .map((type) => ({
        licenseTypeId: type.licenseTypeId,
        licenseName: type.licenseName,
        isActive: type.isActive,
        lastUpdate: formatDateAndTime(type.lastUpdate),
        updatedBy: type.updatedBy,
      }));

    const formattedLicenses = paginatedLicenses.map((license) => ({
      licenseId: license.licenseId,
      staffId: license.staffId,
      licenseNumber: license.licenseNumber,
      expiryDate: license.expiryDate,
      licenseTypeId: license.licenseTypeId,
      isActive: license.isActive,
      lastUpdate: formatDateAndTime(license.lastUpdate),
      updatedBy: license.updatedBy,
    }));

    // console.log("Staff IDs:", staffIds); // Debugging statement
    // console.log("Filtered Licenses:", filteredLicenses); // Debugging statement

    res.status(200).json({
      result: "OK",
      licenses: formattedLicenses,
      licenseTypes: formattedlicenseTypes,
    });
  } catch (error) {
    console.error(error); // Log the error
    res.status(500).json({ result: "NG", error: "Internal Server Error" });
  }
});

router.put("/:licenseId", async (req, res) => {
  try {
    const requestedLicenseId = req.params.licenseId;
    const updatedLicense = req.body;

    // Prevent updating licenseId directly
    if ("licenseId" in updatedLicense) {
      res.status(400).json({ message: "Cannot update licenseId" });
      return;
    }

    // Adding lastUpdate and updatedBy to the updatedLicense object
    const now = new Date();
    updatedLicense.lastUpdate = formatDateAndTime(now);
    updatedLicense.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const licenseDetails = await getLicenseByLicenseId(requestedLicenseId);

    if (licenseDetails) {
      const licenseKey = Object.keys(licenseDetails)[0];
      await updateLicense(licenseKey, updatedLicense);

      // Prepare the updated license object for response
      const updatedResponseLicense = {
        ...updatedLicense,
        licenseId: parseInt(requestedLicenseId),
      };

      const licenseTypeSnapshot = await licenseTypesRef
        .child(String(updatedLicense.licenseTypeId))
        .once("value");
      const licenseType = licenseTypeSnapshot.val();

      res.status(200).json({
        result: "OK",
        license: updatedResponseLicense,
        licenseType: {
          licenseTypeId: licenseType.licenseTypeId,
          licenseTypeName: licenseType.licenseTypeName,
          lastUpdate: formatDateAndTime(licenseType.lastUpdate),
          updatedBy: licenseType.updatedBy,
        },
      });
    } else {
      res.status(404).json({ result: "NG", message: "License not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

router.delete("/:licenseId", async (req, res) => {
  try {
    const requestedLicenseId = req.params.licenseId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const licenseDetails = await getLicenseByLicenseId(requestedLicenseId);

    if (licenseDetails) {
      const licenseKey = Object.keys(licenseDetails)[0];
      const actualLastUpdate = licenseDetails[licenseKey].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the license as inactive and update necessary fields
      const updatedLicense = {
        ...licenseDetails[licenseKey],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      await updateLicense(licenseKey, updatedLicense);

      // Get the license type details
      const licenseTypeId = licenseDetails[licenseKey].licenseTypeId;
      const licenseTypeSnapshot = await licenseTypesRef
        .child(String(licenseTypeId))
        .once("value");
      const licenseType = licenseTypeSnapshot.val();

      // Prepare the response objects
      const responseLicense = {
        licenseId: parseInt(requestedLicenseId),
        ...updatedLicense,
      };

      const responseLicenseType = {
        licenseTypeId: licenseType.licenseTypeId,
        licenseTypeName: licenseType.licenseTypeName,
        lastUpdate: formatDateAndTime(licenseType.lastUpdate),
        updatedBy: licenseType.updatedBy,
      };

      res.status(200).json({
        result: "OK",
        license: responseLicense,
        licenseType: responseLicenseType,
      });
    } else {
      res.status(404).json({ result: "NG", message: "License not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

router.get("/:licenseId", async (req, res) => {
  try {
    const requestedLicenseId = req.params.licenseId;
    const licenseDetails = await getLicenseByLicenseId(requestedLicenseId);

    if (licenseDetails) {
      const licenseKey = Object.keys(licenseDetails)[0];
      const formattedLicense = {
        licenseId: parseInt(requestedLicenseId),
        ...licenseDetails[licenseKey],
        lastUpdate: formatDateAndTime(licenseDetails[licenseKey].lastUpdate),
      };

      const licenseTypeId = licenseDetails[licenseKey].licenseTypeId;

      const licenseTypeSnapshot = await licenseTypesRef
        .child(String(licenseTypeId))
        .once("value");
      const licenseType = licenseTypeSnapshot.val();

      res.status(200).json({
        result: "OK",
        license: formattedLicense,
        licenseType: {
          licenseTypeId: licenseType.licenseTypeId,
          licenseTypeName: licenseType.licenseTypeName,
          lastUpdate: formatDateAndTime(licenseType.lastUpdate),
          updatedBy: licenseType.updatedBy,
        },
      });
    } else {
      res.status(404).json({ result: "NG", message: "License not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
