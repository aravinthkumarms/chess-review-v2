const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.resolve(__dirname, '../../chessly-downloader/downloads');
const TARGET_DIR = path.resolve(__dirname, '../public/lessons');

// Ensure target directory exists
if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// Generate an index tree
const libraryIndex = [];

function syncDirectory() {
    console.log('Syncing lessons from', SOURCE_DIR);

    if (!fs.existsSync(SOURCE_DIR)) {
        console.error('Source directory not found. Have you downloaded the lessons yet?');
        process.exit(1);
    }

    const courses = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const courseFolder of courses) {
        console.log(`Processing ${courseFolder}...`);
        const coursePath = path.join(SOURCE_DIR, courseFolder);

        const courseTarget = path.join(TARGET_DIR, courseFolder);
        if (!fs.existsSync(courseTarget)) {
            fs.mkdirSync(courseTarget, { recursive: true });
        }

        const courseIndex = {
            id: courseFolder,
            name: courseFolder.replace(/^\d+_/, ''), // remove prefix like "01_"
            chapters: []
        };

        let hasCourseJson = false;
        let courseOrientation = 'w';
        let courseKind = 'standard'; // Default kind
        if (fs.existsSync(path.join(coursePath, 'course.json'))) {
            try {
                const courseDataStr = fs.readFileSync(path.join(coursePath, 'course.json'), 'utf-8');
                const courseData = JSON.parse(courseDataStr);
                if (courseData.color === 'B' || (courseData.tags && courseData.tags.includes('Black Openings'))) {
                    courseOrientation = 'b';
                }
                if (courseData._kind) {
                    courseKind = courseData._kind;
                }
                fs.copyFileSync(path.join(coursePath, 'course.json'), path.join(courseTarget, 'course.json'));
                hasCourseJson = true;
            } catch (err) {
                console.warn(`  ⚠️ Could not copy course.json for ${courseFolder}: ${err.message}`);
            }
        }

        courseIndex.orientation = courseOrientation;
        courseIndex.kind = courseKind;

        const chapters = fs.readdirSync(coursePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const chapFolder of chapters) {
            const chapPath = path.join(coursePath, chapFolder);
            const chapTarget = path.join(courseTarget, chapFolder);

            if (!fs.existsSync(chapTarget)) {
                fs.mkdirSync(chapTarget, { recursive: true });
            }

            const chapterIndex = {
                id: chapFolder,
                name: chapFolder.replace(/^\d+_/, '').replace(/^Chapter \d+_ /, ''),
                studies: []
            };

            if (fs.existsSync(path.join(chapPath, 'chapter.json'))) {
                try {
                    fs.copyFileSync(path.join(chapPath, 'chapter.json'), path.join(chapTarget, 'chapter.json'));
                } catch (err) {
                    console.warn(`  ⚠️ Could not copy chapter.json for ${chapFolder}: ${err.message}`);
                }
            }

            const studies = fs.readdirSync(chapPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const studyFolder of studies) {
                const studyPath = path.join(chapPath, studyFolder);
                const studyTarget = path.join(chapTarget, studyFolder);

                // Only sync if there's a lesson.json
                const lessonJsonPath = path.join(studyPath, 'lesson.json');
                if (fs.existsSync(lessonJsonPath)) {
                    if (!fs.existsSync(studyTarget)) {
                        fs.mkdirSync(studyTarget, { recursive: true });
                    }

                    // Actually copy the lesson.json file
                    try {
                        fs.copyFileSync(lessonJsonPath, path.join(studyTarget, 'lesson.json'));
                    } catch (err) {
                        console.warn(`  ⚠️ Could not copy lesson.json for ${studyFolder} (might be locked by downloader): ${err.message}`);
                    }

                    let lessonType = 'STUDY';
                    let variationCount = 1;
                    try {
                        const lessonData = JSON.parse(fs.readFileSync(lessonJsonPath, 'utf-8'));
                        if (lessonData.type) {
                            lessonType = lessonData.type;
                        }
                        // Count variations using max variationIndex + 1 from the moves map
                        if (lessonData.moves && typeof lessonData.moves === 'object') {
                            let maxVarIdx = 0;
                            for (const movesArr of Object.values(lessonData.moves)) {
                                for (const move of movesArr) {
                                    if (typeof move.variationIndex === 'number' && move.variationIndex > maxVarIdx) {
                                        maxVarIdx = move.variationIndex;
                                    }
                                }
                            }
                            variationCount = maxVarIdx + 1;
                        }
                    } catch (e) {
                        // Default to 1
                    }

                    const videoFile = fs.readdirSync(studyPath).find(f => f.startsWith('video.') && (f.endsWith('.mp4') || f.endsWith('.webm')));
                    let videoPath = null;
                    if (videoFile) {
                        // We store the path relative to the SOURCE_DIR to serve via proxy
                        videoPath = `/${courseFolder}/${chapFolder}/${studyFolder}/${videoFile}`;
                    }

                    chapterIndex.studies.push({
                        id: studyFolder,
                        name: studyFolder.replace(/^\d+_/, '').replace(/^Study \d+_ /, ''),
                        path: `${courseFolder}/${chapFolder}/${studyFolder}/lesson.json`,
                        videoPath: videoPath,
                        type: lessonType,
                        variationCount: variationCount
                    });
                }
            }

            if (chapterIndex.studies.length > 0) {
                courseIndex.chapters.push(chapterIndex);
            }
        }

        if (courseIndex.chapters.length > 0 || hasCourseJson) {
            libraryIndex.push(courseIndex);
        }
    }

    const indexPath = path.join(TARGET_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(libraryIndex, null, 2));
    console.log(`Successfully synced ${libraryIndex.length} courses!`);
}

syncDirectory();
