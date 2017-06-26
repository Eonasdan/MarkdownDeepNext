/// <binding BeforeBuild='build' />
module.exports = function (grunt) {
    'use strict';
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            js: {
                src: 'dist/js/markdownDeep.js',
                dest: 'dist/js/markdownDeep.min.js'
            }
        },
        jshint: {
            all: [
                'Gruntfile.js', 'src/js/*.js'
            ],
            options: {
                'browser': true,
                'node': true,
                'jquery': true,
                'boss': false,
                'curly': true,
                'debug': false,
                'devel': false,
                'eqeqeq': true,
                'bitwise': true,
                'eqnull': true,
                'evil': false,
                'forin': true,
                'immed': false,
                'laxbreak': false,
                'newcap': true,
                'noarg': true,
                'noempty': false,
                'nonew': false,
                'onevar': true,
                'plusplus': false,
                'regexp': false,
                'undef': true,
                'sub': true,
                'strict': true,
                'unused': false,
                'white': true,
                'es3': true,
                'camelcase': true,
                'quotmark': 'single',
                'supernew': false,
                'globals': {
                    'define': false,
                    'jasmine': false,
                    'describe': false,
                    'xdescribe': false,
                    'expect': false,
                    'it': false,
                    'xit': false,
                    'spyOn': false,
                    'beforeEach': false,
                    'afterEach': false,
                    'jQuery': false
                }
            }
        },
        jscs: {
            all: [
                'Gruntfile.js', 'src/js/*.js'
            ],
            options: {
                config: '.jscs.json'
            }
        },
        watch: {
            less: {
                files: ['*.less'],
                tasks: ['less'],
                options: {
                    livereload: true
                }
            },
            js: {
                files: ['MarkdownDeep.js', 'MarkdownDeepEditor.js', 'MarkdownDeepEditorUI.js'],
                tasks: ['jsbuild'],
                options: {
                    livereload: true
                }
            }
        },
        less: {
            production: {
                options: {
                    cleancss: true,
                    compress: true
                },
                files: {
                    'dist/css/markdownDeep.min.css': 'src/less/markdownDeep.less'

                }
            },
            development: {
                files: {
                    'dist/css/markdownDeep.css': 'src/less/markdownDeep.less'
                }
            }
        },
        concat: {
            js: {
                src: ['src/js/MarkdownDeep.js', 'src/js/MarkdownDeepEditor.js', 'src/js/MarkdownDeepEditorUI.js'],
                dest: 'dist/js/markdownDeep.js'
            }
        },
        nugetpack: {
            client: {
                src: 'src/nuget/MarkdownDeepNext.Js.nuspec',
                dest: '../../output',
                options: {
                    version: '<%= pkg.version %>'
                }
            }
        }
    });

    grunt.registerTask('default', ['build']);
    grunt.registerTask('build', ['jsbuild', 'less', 'nugetpack']);
    grunt.registerTask('jsbuild', ['concat', 'uglify']); //, 'jshint', 'jscs' todo someday should fix this, but I just don't care atm
    grunt.loadTasks('tasks');
    require('load-grunt-tasks')(grunt);
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-nuget');

    grunt.registerTask('release', function (version) {
        if (!version || version.split('.').length !== 3) {
            grunt.fail.fatal('malformed version. Use grunt release:1.2.3');
        }

        grunt.task.run([
            'bump_version:' + version,
            'build'
        ]);
    });
};
