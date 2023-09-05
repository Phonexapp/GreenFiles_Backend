const express = require("express");
const admin = require("../firebase/firebase");
const router = express.Router();
const { formatDateAndTime } = require("../Utilities/dateTime");
const {
  getJobCategoryByCategoryId,
  updateJobCategory,
} = require("../Utilities/jobCategoryUtils");
const dotenv = require("dotenv");
dotenv.config();

const db = admin.database();
const jobCategoriesRef = db.ref("jobCategories");

const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS || 10;
const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL || "current_user@example.com";

// Middleware for error handling
const errorHandler = (res, error) => {
  console.error(error);
  res.status(500).json({ result: "NG", error: "Internal Server Error" });
};

// Middleware to handle active categories filtering
const filterActiveCategories = (categories, activeOnly) => {
  if (activeOnly) {
    return categories.filter((category) => category.isActive);
  }
  return categories;
};

// Get all job categories
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const activeOnly = req.query.active_only !== "false";

    const jobCategoriesSnapshot = await jobCategoriesRef.once("value");
    const jobCategories = jobCategoriesSnapshot.val();

    const filteredCategories = filterActiveCategories(
      Object.values(jobCategories),
      activeOnly
    );
    const totalPages = Math.ceil(filteredCategories.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedJobCategories = filteredCategories.slice(
      startIndex,
      endIndex
    );
    const formattedJobCategories = paginatedJobCategories.map((category) => ({
      ...category,
      lastUpdate: formatDateAndTime(category.lastUpdate),
    }));

    res.status(200).json({
      result: "OK",
      jobCategories: formattedJobCategories,
    });
  } catch (error) {
    errorHandler(res, error);
  }
});

// Add a new Job Category
router.post("/", async (req, res) => {
  try {
    const { jobCategoryName } = req.body;

    const jobCategoriesSnapshot = await jobCategoriesRef.once("value");

    let nextJobCategoryId = 1;

    jobCategoriesSnapshot.forEach((childSnapshot) => {
      const jobCategoryId = childSnapshot.val().jobCategoryId;
      nextJobCategoryId = Math.max(nextJobCategoryId, jobCategoryId + 1);
    });

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      const newJobCategory = {
        jobCategoryId: nextJobCategoryId,
        jobCategoryName,
        isActive: true,
        lastUpdate: formatDateAndTime(new Date()),
        updatedBy: DEFAULT_USER_EMAIL,
      };

      const existingCategorySnapshot = await jobCategoriesRef
        .orderByChild("jobCategoryId")
        .equalTo(nextJobCategoryId)
        .once("value");

      if (!existingCategorySnapshot.exists()) {
        const jobCategoryRef = jobCategoriesRef.child(
          String(nextJobCategoryId)
        );
        await jobCategoryRef.set(newJobCategory);

        const response = {
          result: "OK",
          jobCategoryId: nextJobCategoryId,
          jobCategory: newJobCategory,
        };

        res.status(201).json(response);
        break;
      }

      nextJobCategoryId++;
      attempt++;
    }

    if (attempt >= MAX_ATTEMPTS) {
      res.status(500).json({ result: "NG", error: "Max attempts reached" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Update job category by jobCategoryId
router.put("/:jobCategoryId", async (req, res) => {
  try {
    const requestedJobCategoryId = req.params.jobCategoryId;
    const updatedJobCategory = req.body;

    // Prevent updating jobCategoryId directly
    if ("jobCategoryId" in updatedJobCategory) {
      res.status(400).json({ message: "Cannot update jobCategoryId" });
      return;
    }

    // Adding lastUpdate and updatedBy to the updatedJobCategory object
    const now = new Date();
    updatedJobCategory.lastUpdate = formatDateAndTime(now);
    updatedJobCategory.updatedBy =
      process.env.DEFAULT_USER_EMAIL || "current_user@example.com"; // Replace with actual user info

    const jobCategoryDetails = await getJobCategoryByCategoryId(
      requestedJobCategoryId
    );

    if (jobCategoryDetails) {
      const jobCategoryId = Object.keys(jobCategoryDetails)[0];
      await updateJobCategory(jobCategoryId, updatedJobCategory);

      // Prepare the updated jobCategory object for response
      const updatedResponseJobCategory = {
        ...updatedJobCategory,
        jobCategoryId: parseInt(jobCategoryId),
      };

      res.status(200).json({
        result: "OK",
        jobCategory: updatedResponseJobCategory,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Job category not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Retrieve job category by jobCategoryId
router.get("/:jobCategoryId", async (req, res) => {
  try {
    const requestedJobCategoryId = req.params.jobCategoryId;
    const jobCategoryDetails = await getJobCategoryByCategoryId(
      requestedJobCategoryId
    );

    if (jobCategoryDetails) {
      const jobCategoryId = Object.keys(jobCategoryDetails)[0];
      const formattedJobCategory = {
        jobCategoryId: parseInt(jobCategoryId),
        ...jobCategoryDetails[jobCategoryId],
        lastUpdate: formatDateAndTime(
          jobCategoryDetails[jobCategoryId].lastUpdate
        ),
      };

      res.status(200).json({
        result: "OK",
        jobCategory: formattedJobCategory,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Job category not found" });
    }
  } catch (error) {
    errorHandler(res, error);
  }
});

// Delete job category by jobCategoryId
router.delete("/:jobCategoryId", async (req, res) => {
  try {
    const requestedJobCategoryId = req.params.jobCategoryId;
    const providedLastUpdate = req.body.lastUpdate;

    if (!providedLastUpdate) {
      res.status(400).json({
        result: "NG",
        message: "LastUpdate field is required in the request body",
      });
      return;
    }

    const jobCategoryDetails = await getJobCategoryByCategoryId(
      requestedJobCategoryId
    );

    if (jobCategoryDetails) {
      const jobCategoryId = Object.keys(jobCategoryDetails)[0];
      const actualLastUpdate = jobCategoryDetails[jobCategoryId].lastUpdate;

      if (providedLastUpdate !== actualLastUpdate) {
        res.status(400).json({
          result: "NG",
          message: "Provided lastUpdate does not match actual lastUpdate",
        });
        return;
      }

      // Update isActive to false in the database
      const updatedJobCategory = {
        ...jobCategoryDetails[jobCategoryId],
        isActive: false,
        lastUpdate: formatDateAndTime(new Date()),
      };

      await updateJobCategory(jobCategoryId, updatedJobCategory);

      // Prepare the response jobCategory object
      const responseJobCategory = {
        jobCategoryId: parseInt(jobCategoryId),
        ...updatedJobCategory,
      };

      res.status(200).json({
        result: "OK",
        jobCategory: responseJobCategory,
      });
    } else {
      res.status(404).json({ result: "NG", message: "Job category not found" });
    }
  } catch (error) {
    res.status(500).json({ result: "NG", error: error.message });
  }
});

module.exports = router;
