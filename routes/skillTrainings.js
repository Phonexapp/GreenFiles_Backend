const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getSkillTrainingById,
  updateSkillTraining,
} = require("../Utilities/skillTrainingUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const skillTrainingsRef = db.ref("skillTrainings");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active trainings filtering
const filterActiveTrainings = (trainings, activeOnly) => {
  if (activeOnly) {
    return trainings.filter((training) => training.isActive);
  }
  return trainings;
};

// Get all skill trainings
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const skillTrainingsSnapshot = await skillTrainingsRef.once("value");
    const skillTrainings = skillTrainingsSnapshot.val();

    const filteredTrainings = filterActiveTrainings(
      Object.values(skillTrainings),
      activeOnly
    );
    const totalPages = Math.ceil(filteredTrainings.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedSkillTrainings = filteredTrainings.slice(
      startIndex,
      endIndex
    );
    const formattedSkillTrainings = paginatedSkillTrainings.map((training) => ({
      ...training,
      lastUpdate: formatDateAndTime(training.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      skillTrainings: formattedSkillTrainings,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Skill Training
router.post("/", async (req, res) => {
  try {
    const { skillTrainingName } = req.body;

    const skillTrainingsSnapshot = await skillTrainingsRef.once("value");

    let nextSkillTrainingId = 1;

    skillTrainingsSnapshot.forEach((childSnapshot) => {
      const skillTrainingId = childSnapshot.val().skillTrainingId;
      nextSkillTrainingId = Math.max(nextSkillTrainingId, skillTrainingId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newSkillTraining = {
        skillTrainingId: nextSkillTrainingId,
        skillTrainingName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingTrainingSnapshot = await skillTrainingsRef
        .orderByChild("skillTrainingId")
        .equalTo(nextSkillTrainingId)
        .once("value");

      if (!existingTrainingSnapshot.exists()) {
        const skillTrainingRef = skillTrainingsRef.child(
          String(nextSkillTrainingId)
        );
        await skillTrainingRef.set(newSkillTraining);

        const response = {
          result: "OK",
          skillTrainingId: nextSkillTrainingId,
          skillTraining: newSkillTraining,
        };

        res.status(201).json(response);
        break;
      }

      nextSkillTrainingId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

//Update skill training by skillTrainingId
router.put("/:skillTrainingId", async (req, res) => {
  try {
    const requestedSkillTrainingId = req.params.skillTrainingId;
    const updatedSkillTraining = req.body;

    if ("skillTrainingId" in updatedSkillTraining) {
      res
        .status(400)
        .json({ result: "NG", message: "Cannot update skillTrainingId" });
      return;
    }

    const now = new Date();
    updatedSkillTraining.lastUpdate = formatDateAndTime(now);
    updatedSkillTraining.updatedBy = DEFAULT_USER_EMAIL;

    const skillTrainingDetails = await getSkillTrainingById(
      requestedSkillTrainingId
    );

    if (skillTrainingDetails) {
      const skillTrainingId = Object.keys(skillTrainingDetails)[0];
      await updateSkillTraining(skillTrainingId, updatedSkillTraining);

      const updatedResponseSkillTraining = {
        ...updatedSkillTraining,
        skillTrainingId: parseInt(skillTrainingId),
      };

      res
        .status(200)
        .json({ result: "OK", skillTraining: updatedResponseSkillTraining });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Skill training not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve skill training by skillTrainingId
router.get("/:skillTrainingId", async (req, res) => {
  try {
    const requestedSkillTrainingId = req.params.skillTrainingId;
    const skillTrainingDetails = await getSkillTrainingById(
      requestedSkillTrainingId
    );

    if (skillTrainingDetails) {
      const skillTrainingId = Object.keys(skillTrainingDetails)[0];
      const formattedSkillTraining = {
        skillTrainingId: parseInt(skillTrainingId),
        ...skillTrainingDetails[skillTrainingId],
        lastUpdate: formatDateAndTime(
          skillTrainingDetails[skillTrainingId].lastUpdate
        ),
      };

      res
        .status(200)
        .json({ result: "OK", skillTraining: formattedSkillTraining });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Skill training not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete skill training by skillTrainingId
router.delete("/:skillTrainingId", async (req, res) => {
  try {
    const requestedSkillTrainingId = req.params.skillTrainingId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const skillTrainingDetails = await getSkillTrainingById(
      requestedSkillTrainingId
    );

    if (skillTrainingDetails) {
      const skillTrainingId = Object.keys(skillTrainingDetails)[0];
      const actualLastUpdate = skillTrainingDetails[skillTrainingId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Mark the skill training as inactive and update necessary fields
      const updatedSkillTraining = {
        ...skillTrainingDetails[skillTrainingId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: process.env.DEFAULT_USER_EMAIL || "current_user@example.com", // Replace with actual user info
      };

      await updateSkillTraining(skillTrainingId, updatedSkillTraining);

      // Prepare the response skillTraining object
      const responseSkillTraining = {
        skillTrainingId: parseInt(skillTrainingId),
        ...updatedSkillTraining,
      };

      res.status(200).json({
        result: "OK",
        skillTraining: responseSkillTraining,
      });
    } else {
      res
        .status(404)
        .json({ result: "NG", message: "Skill training not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

module.exports = router;
