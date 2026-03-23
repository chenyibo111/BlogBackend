/*
  Warnings:

  - You are about to drop the `_PostToTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to alter the column `B` on the `_CategoryToPost` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `posts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `posts` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- DropIndex
DROP INDEX "_PostToTag_B_index";

-- DropIndex
DROP INDEX "_PostToTag_AB_unique";

-- DropIndex
DROP INDEX "tags_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_PostToTag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "tags";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new__CategoryToPost" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_CategoryToPost_A_fkey" FOREIGN KEY ("A") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CategoryToPost_B_fkey" FOREIGN KEY ("B") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new__CategoryToPost" ("A", "B") SELECT "A", "B" FROM "_CategoryToPost";
DROP TABLE "_CategoryToPost";
ALTER TABLE "new__CategoryToPost" RENAME TO "_CategoryToPost";
CREATE UNIQUE INDEX "_CategoryToPost_AB_unique" ON "_CategoryToPost"("A", "B");
CREATE INDEX "_CategoryToPost_B_index" ON "_CategoryToPost"("B");
CREATE TABLE "new_posts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "coverImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_posts" ("authorId", "content", "coverImage", "createdAt", "excerpt", "id", "publishedAt", "slug", "status", "title", "updatedAt", "views") SELECT "authorId", "content", "coverImage", "createdAt", "excerpt", "id", "publishedAt", "slug", "status", "title", "updatedAt", "views" FROM "posts";
DROP TABLE "posts";
ALTER TABLE "new_posts" RENAME TO "posts";
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");
CREATE INDEX "posts_status_idx" ON "posts"("status");
CREATE INDEX "posts_publishedAt_idx" ON "posts"("publishedAt" DESC);
CREATE INDEX "posts_status_publishedAt_idx" ON "posts"("status", "publishedAt" DESC);
CREATE INDEX "posts_createdAt_idx" ON "posts"("createdAt" DESC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
