const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getSpecialEducationById,
  updateSpecialEducation,
} = require("../Utilities/specialEducationsUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const specialEducationsRef = db.ref("specialEducations");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active special educations filtering
const filterActiveSpecialEducations = (educations, activeOnly) => {
  if (activeOnly) {
    return educations.filter((education) => education.isActive);
  }
  return educations;
};

// Get all special educations
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const specialEducationsSnapshot = await specialEducationsRef.once("value");
    let specialEducations = specialEducationsSnapshot.val();

    specialEducations = filterActiveSpecialEducations(
      Object.values(specialEducations),
      activeOnly
    );

    const totalPages = Math.ceil(specialEducations.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedSpecialEducations = specialEducations.slice(
      startIndex,
      endIndex
    );
    const formattedSpecialEducations = paginatedSpecialEducations.map(
      (education) => ({
        ...education,
        lastUpdate: formatDateAndTime(education.lastUpdate),
      })
    );

    res.status(200).json({
      result: "OK",
      specialEducations: formattedSpecialEducations,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Special Education
router.post("/", async (req, res) => {
  try {
    const { specialEducationName } = req.body;

    const specialEducationsSnapshot = await specialEducationsRef.once("value");

    let nextSpecialEducationId = 1;

    specialEducationsSnapshot.forEach((childSnapshot) => {
      const specialEducationId = childSnapshot.val().specialEducationId;
      nextSpecialEducationId = Math.max(
        nextSpecialEducationId,
        specialEducationId + 1
      );
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newSpecialEducation = {
        specialEducationId: nextSpecialEducationId,
        specialEducationName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingEducationSnapshot = await specialEducationsRef
        .orderByChild("specialEducationId")
        .equalTo(nextSpecialEducationId)
        .once("value");

      if (!existingEducationSnapshot.exists()) {
        const specialEducationRef = specialEducationsRef.child(
          String(nextSpecialEducationId)
        );
        await specialEducationRef.set(newSpecialEducation);

        const response = {
          result: "OK",
          specialEducationId: nextSpecialEducationId,
          specialEducation: newSpecialEducation,
        };

        res.status(201).json(response);
        break;
      }

      nextSpecialEducationId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update special education by specialEducationId
router.put("/:specialEducationId", async (req, res) => {
  try {
    const requestedSpecialEducationId = req.params.specialEducationId;
    const updatedSpecialEducation = req.body;

    if ("specialEducationId" in updatedSpecialEducation) {
      res.status(400).json({ message: "Cannot update specialEducationId" });
      return;
    }

    const now = new Date();
    updatedSpecialEducation.lastUpdate = formatDateAndTime(now);
    updatedSpecialEducation.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

    const specialEducationDetails = await getSpecialEducationById(
      requestedSpecialEducationId
    );

    if (specialEducationDetails) {
      const specialEducationId = Object.keys(specialEducationDetails)[0];
      await updateSpecialEducation(specialEducationId, updatedSpecialEducation);

      const updatedResponseSpecialEducation = {
        ...updatedSpecialEducation,
        specialEducationId: parseInt(specialEducationId),
      };

      res.status(200).json({
        result: "OK",
        specialEducation: updatedResponseSpecialEducation,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Special education not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve special education by specialEducationId
router.get("/:specialEducationId", async (req, res) => {
  try {
    const requestedSpecialEducationId = req.params.specialEducationId;
    const specialEducationDetails = await getSpecialEducationById(
      requestedSpecialEducationId
    );

    if (specialEducationDetails) {
      const specialEducationId = Object.keys(specialEducationDetails)[0];
      const formattedSpecialEducation = {
        specialEducationId: parseInt(specialEducationId),
        ...specialEducationDetails[specialEducationId],
        lastUpdate: formatDateAndTime(
          specialEducationDetails[specialEducationId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        specialEducation: formattedSpecialEducation,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Special education not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete special education by specialEducationId
router.delete("/:specialEducationId", async (req, res) => {
  try {
    const requestedSpecialEducationId = req.params.specialEducationId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const specialEducationDetails = await getSpecialEducationById(
      requestedSpecialEducationId
    );

    if (specialEducationDetails) {
      const specialEducationId = Object.keys(specialEducationDetails)[0];
      const actualLastUpdate =
        specialEducationDetails[specialEducationId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the special education as inactive and update necessary fields
      const updatedSpecialEducation = {
        ...specialEducationDetails[specialEducationId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateSpecialEducation(specialEducationId, updatedSpecialEducation);

      // Prepare the response specialEducation object
      const responseSpecialEducation = {
        specialEducationId: parseInt(specialEducationId),
        ...updatedSpecialEducation,
      };

      res.status(200).json({
        result: "OK",
        specialEducation: responseSpecialEducation,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Special education not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
