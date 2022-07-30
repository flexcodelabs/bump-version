import * as github from '@actions/github'
import * as core from '@actions/core'
import gulp from 'gulp'
import jsonModify from 'gulp-json-modify'
import gap from 'gulp-append-prepend'

const GITHUB_TOKEN: any = core.getInput('GITHUB_TOKEN')
const PACKAGE_VERSION: any = core.getInput('PACKAGE_VERSION')
const DELETE_BRANCH: any = core.getInput('DELETE_BRANCH')
const CHANGELOG_PATH: any = core.getInput('CHANGELOG_PATH')
const PACKAGE_JSON_PATH: any = core.getInput('PACKAGE_JSON_PATH')
const octokit = github.getOctokit(GITHUB_TOKEN)
const {context = {}}: any = github

const run = async () => {
  // fetch the latest pull request merged in target branch
  let pull = null
  // get pull number
  let pull_number: any = context.payload?.head_commit?.message
    ?.split(' ')
    ?.find(o => o?.includes('#'))
    ?.split('#')[1]
  try {
    const latestPull = await octokit.rest.pulls.get({
      owner: context.payload?.repository?.owner?.login,
      repo: context.payload?.repository?.name,
      pull_number
    })
    // fetch pull request
    pull = latestPull?.data
  } catch (error: any) {
    if (error instanceof Error) core.setFailed(error.message)
  }
  // bump version
  // let ver = require("../package.json").version; //version defined in the package.json file
  let splitString: any = PACKAGE_VERSION.split('.', 3)
  let majorVersion: any = splitString[0].split('"', 1)
  let minorVersion: any = splitString[1].split('"', 1)
  let patchVersion: any = splitString[2].split('"', 1)

  let patchNumber: any = Number(patchVersion[0])
  let minorNumber: any = Number(minorVersion[0])
  let majorNumber: any = Number(majorVersion[0])
  if (patchNumber < 9) {
    patchNumber++
    splitString[2] = String(patchNumber)
  } else {
    splitString[2] = String(0)
    if (minorNumber < 9) {
      minorNumber++
      splitString[1] = String(minorNumber)
    } else {
      splitString[1] = String(0)
      majorNumber++
      splitString[0] = String(majorNumber)
    }
  }

  let new_version: any = splitString.join('.')
  // save version
  if (new_version) {
    try {
      gulp
        .src([PACKAGE_JSON_PATH ?? './package.json'])
        .pipe(
          jsonModify({
            key: 'version',
            value: new_version
          })
        )
        .pipe(gulp.dest('./'))
    } catch (error: any) {
      if (error instanceof Error) core.setFailed(error.message)
    }

    // update changelog
    let commits: any = ''
    try {
      // fetch commits from pull request
      const pull_commits = await octokit.request(
        `GET /repos/${context.payload?.repository?.full_name}/pulls/${pull?.number}/commits`,
        {
          owner: context.payload?.repository?.owner?.login,
          repo: context.payload?.repository?.name,
          pull_number: pull?.number
        }
      )

      pull_commits?.data?.forEach((e, i) => {
        if (
          !e?.commit?.message.includes('Merge') &&
          !e?.commit?.message.includes('Merged') &&
          !e?.commit?.message.includes('skip') &&
          !e?.commit?.message.includes('Skip')
        )
          commits =
            i === 0
              ? '* ' + e.commit.message
              : commits + '\n\n' + '* ' + e.commit.message
      })
    } catch (error: any) {
      core.info('No commits found for this PR')
    }
    try {
      if (commits != '') {
        gulp
          .src([CHANGELOG_PATH ?? './changelog.md'])
          .pipe(gap.prependText(commits))
          .pipe(gap.prependText(`# ${new_version}`))
          .pipe(gulp.dest('./'))
      } else {
        gulp
          .src([CHANGELOG_PATH ?? './changelog.md'])
          .pipe(gap.prependText('* No message for these changes'))
          .pipe(gap.prependText(`# ${new_version}`))
          .pipe(gulp.dest('./'))
      }
    } catch (error: any) {
      if (error instanceof Error) core.setFailed(error.message)
    }
    // delete branch
    if (DELETE_BRANCH) {
      const branch_to_delete: any = pull?.head?.ref
      try {
        // fetch branches list
        const branches = await octokit.rest.repos.listBranches({
          owner: context.payload?.repository?.owner?.login,
          repo: context.payload?.repository?.name
        })
        if (
          branches?.data?.find(el => el?.name === branch_to_delete) &&
          branch_to_delete !== 'develop' &&
          branch_to_delete !== 'staging' &&
          branch_to_delete !== 'master' &&
          branch_to_delete !== 'main'
        ) {
          await octokit.request(
            `DELETE /repos/${context.payload?.repository?.full_name}/git/refs/heads/${branch_to_delete}`,
            {
              owner: context.payload?.repository?.owner?.login,
              repo: context.payload?.repository?.name
            }
          )
          core.info('branch deleted successfully')
        }
      } catch (error: any) {
        core.info('failed to delete branch')
      }
    }
    commits = commits?.split('*').join('>')
    core.setOutput('body', commits)
    core.setOutput('new_version', new_version)
  }
}

run()
