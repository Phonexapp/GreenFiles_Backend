const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getOfficialPositionByPositionId,
  updateOfficialPosition,
} = require("../Utilities/officialPositionUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const officialPositionsRef = db.ref("officialPositions");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active positions filtering
const filterActivePositions = (positions, activeOnly) => {
  if (activeOnly) {
    return positions.filter((position) => position.isActive);
  }
  return positions;
};

// Get all official positions
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const officialPositionsSnapshot = await officialPositionsRef.once("value");
    let officialPositions = officialPositionsSnapshot.val();

    officialPositions = filterActivePositions(
      Object.values(officialPositions),
      activeOnly
    );

    const totalPages = Math.ceil(officialPositions.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedOfficialPositions = officialPositions.slice(
      startIndex,
      endIndex
    );
    const formattedOfficialPositions = paginatedOfficialPositions.map(
      (position) => ({
        ...position,
        lastUpdate: formatDateAndTime(position.lastUpdate),
      })
    );

    res.status(200).json({
      result: "OK",
      officialPositions: formattedOfficialPositions,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Official Position
router.post("/", async (req, res) => {
  try {
    const { officialPositionName } = req.body;

    const officialPositionsSnapshot = await officialPositionsRef.once("value");

    let nextOfficialPositionId = 1;

    officialPositionsSnapshot.forEach((childSnapshot) => {
      const officialPositionId = childSnapshot.val().officialPositionId;
      nextOfficialPositionId = Math.max(
        nextOfficialPositionId,
        officialPositionId + 1
      );
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newOfficialPosition = {
        officialPositionId: nextOfficialPositionId,
        officialPositionName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingPositionSnapshot = await officialPositionsRef
        .orderByChild("officialPositionId")
        .equalTo(nextOfficialPositionId)
        .once("value");

      if (!existingPositionSnapshot.exists()) {
        const officialPositionRef = officialPositionsRef.child(
          String(nextOfficialPositionId)
        );
        await officialPositionRef.set(newOfficialPosition);

        const response = {
          result: "OK",
          officialPositionId: nextOfficialPositionId,
          officialPosition: newOfficialPosition,
        };

        res.status(201).json(response);
        break;
      }

      nextOfficialPositionId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update official position by officialPositionId
router.put("/:officialPositionId", async (req, res) => {
  try {
    const requestedOfficialPositionId = req.params.officialPositionId;
    const updatedOfficialPosition = req.body;

    if ("officialPositionId" in updatedOfficialPosition) {
      res.status(400).json({ message: "Cannot update officialPositionId" });
      return;
    }

    const now = new Date();
    updatedOfficialPosition.lastUpdate = formatDateAndTime(now);
    updatedOfficialPosition.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

    const officialPositionDetails = await getOfficialPositionByPositionId(
      requestedOfficialPositionId
    );

    if (officialPositionDetails) {
      const officialPositionId = Object.keys(officialPositionDetails)[0];
      await updateOfficialPosition(officialPositionId, updatedOfficialPosition);

      const updatedResponseOfficialPosition = {
        ...updatedOfficialPosition,
        officialPositionId: parseInt(officialPositionId),
      };

      res.status(200).json({
        result: "OK",
        officialPosition: updatedResponseOfficialPosition,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Official position not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve official position by officialPositionId
router.get("/:officialPositionId", async (req, res) => {
  try {
    const requestedOfficialPositionId = req.params.officialPositionId;
    const officialPositionDetails = await getOfficialPositionByPositionId(
      requestedOfficialPositionId
    );

    if (officialPositionDetails) {
      const officialPositionId = Object.keys(officialPositionDetails)[0];
      const formattedOfficialPosition = {
        officialPositionId: parseInt(officialPositionId),
        ...officialPositionDetails[officialPositionId],
        lastUpdate: formatDateAndTime(
          officialPositionDetails[officialPositionId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        officialPosition: formattedOfficialPosition,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Official position not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete official position by officialPositionId
router.delete("/:officialPositionId", async (req, res) => {
  try {
    const requestedOfficialPositionId = req.params.officialPositionId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const officialPositionDetails = await getOfficialPositionByPositionId(
      requestedOfficialPositionId
    );

    if (officialPositionDetails) {
      const officialPositionId = Object.keys(officialPositionDetails)[0];
      const actualLastUpdate =
        officialPositionDetails[officialPositionId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the official position as inactive and update necessary fields
      const updatedOfficialPosition = {
        ...officialPositionDetails[officialPositionId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateOfficialPosition(officialPositionId, updatedOfficialPosition);

      // Prepare the response officialPosition object
      const responseOfficialPosition = {
        officialPositionId: parseInt(officialPositionId),
        ...updatedOfficialPosition,
      };

      res.status(200).json({
        result: "OK",
        officialPosition: responseOfficialPosition,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Official position not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
