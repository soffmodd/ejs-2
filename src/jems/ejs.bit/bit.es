#!/usr/bin/env ejs

/*
    bit.es -- Build It! -- Embedthis Build It Framework

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */
module embedthis.bit {

require ejs.unix

public class Bit {
    public var simpleLoad: Boolean

    private const VERSION: Number = 0.2

    /*
        Filter for files that look like temp files and should not be installed
     */
    private const TempFilter = /\.makedep$|\.o$|\.pdb$|\.tmp$|\.save$|\.sav$|OLD|\/Archive\/|\/sav\/|\/save\/|oldFiles|\.libs\/|\.nc|\.orig|\.svn|\.git|^\.[a-zA-Z_]|\.swp$|\.new$|\.nc$|.DS_Store/

    //  MOB - organize
    private var appName: String = 'bit'
    private var args: Args
    private var cross: Boolean
    private var currentBitFile: Path
    private var currentPack: String
    private var currentPlatform: String
    private var envSettings: Object
    private var local: Object
    private var localPlatform: String
    private var missing
    private var options: Object = { control: {}}
    private var out: Stream
    private var platforms: Array
    private var rest: Array
    private var src: Path

    private var home: Path
    private var bareBit: Object = { platform: {}, dir: {}, settings: {}, packs: {}, targets: {}, env: {} }
    private var bit: Object = {}
    private var gen: Object
    private var platform: Object
    private var genout: TextStream
    private var generating: String

    private var defaultTargets: Array
    private var selectedTargets: Array

    private var posix = ['macosx', 'linux', 'unix', 'freebsd', 'solaris']
    private var windows = ['win', 'wince']
    private var start: Date
    private var targetsToBuildByDefault = { exe: true, file: true, lib: true, obj: true, script: true }
    private var targetsToBlend = { exe: true, lib: true, obj: true, action: true, script: true, clean: true }
    private var targetsToClean = { exe: true, file: true, lib: true, obj: true, script: true }

    private var argTemplate = {
        options: {
            benchmark: { alias: 'b' },
            bit: { range: String },
            build: { range: String, separator: Array },
            config: { alias: 'c', range: String },
            'continue': {},
            debug: {},
            diagnose: { alias: 'd' },
            emulate: { range: String },
            force: {},
            gen: { alias: 'g', range: String, separator: Array, commas: true },
            import: { alias: 'init', range: Boolean },
            log: { alias: 'l', range: String },
            out: { range: String },
            pre: { range: String, separator: Array },
            platform: { range: String, separator: Array },
            prefix: { range: String, separator: Array },
            profile: { range: String },
            release: {},
            quiet: { alias: 'q' },
            save: { range: Path },
            'set': { range: String, separator: Array },
            show: { alias: 's'},
            unset: { range: String, separator: Array },
            verbose: { alias: 'v' },
            version: { alias: 'V' },
            why: { alias: 'w' },
            'with': { range: String, separator: Array },
            without: { range: String, separator: Array },
        },
        usage: usage
    }

    function usage(): Void {
        print('\nUsage: bit [options] [targets|actions] ...\n' +
            '  Options:\n' + 
            '    --benchmark                        # Measure elapsed time\n' +
            '    --build file.bit                   # Build the specified bit file\n' +
            '    --config path-to-source            # Configure for building\n' +
            '    --continue                         # Continue on errors\n' +
            '    --debug                            # Same as --profile debug\n' +
            '    --diagnose                         # Emit diagnostic trace \n' +
            '    --emulate os-arch                  # Emulate platform\n' +
            '    --force                            # Override warnings\n' +
            '    --gen [make|sh|vs|xcode]           # Generate project file\n' + 
            '    --import                           # Import standard bit configuration\n' + 
            '    --log logSpec                      # Save errors to a log file\n' +
            '    --out path                         # Save output to a file\n' +
            '    --profile [debug|release|...]      # Use the build profile\n' +
            '    --pre sourcefile                   # Pre-process a sourcefile\n' +
            '    --platform os-arch                 # Add platform for cross-compilation\n' +
            '    --quiet                            # Quiet operation. Suppress trace \n' +
            '    --save path                        # Save blended bit file\n' +
            '    --set [feature=value]              # Enable and a feature\n' +
            '    --show                             # Show commands executed\n' +
            '    --release                          # Same as --profile release\n' +
            '    --unset feature                    # Unset a feature\n' +
            '    --version                          # Dispay the bit version\n' +
            '    --verbose                          # Trace operations\n' +
            '    --with PACK[-platform][=PATH]      # Build with package at PATH\n' +
            '    --without PACK[-platform]          # Build without a package\n' +
            '')
        let path = Path('product.bit')
        if (path.exists) {
            try {
                b.simpleLoad = true
                global.bit = bit = b.bit
                b.loadWrapper(path)
                if (bit.usage) {
                    print('Feature Selection: ')
                    for (let [item,msg] in bit.usage) {
                        print('  --set %-14s %s' % [item + '=value', msg])
                    }
                }
            } catch (e) { print('CATCH: ' + e)}
        }
        App.exit(1)
    }

    function main() {
        let start = new Date
        global._b = this
        args = Args(argTemplate)
        options = args.options
        home = App.dir
        try {
            setup(args)
            if (options.import) {
                import()
                App.exit()
            } 
            if (options.config) {
                configure()
            }
            process(options.build)
        } catch (e) {
            let msg: String
            if (e is String) {
                App.log.error('' + e + '\n')
            } else {
                App.log.error('' + ((options.diagnose) ? e : e.message) + '\n')
            }
            App.exit(2)
        }
        if (options.benchmark) {
            trace('Benchmark', 'Elapsed time %.2f' % ((start.elapsed / 1000)) + ' secs.')
        }
    }

    /*
        Parse arguments
     */
    function setup(args: Args) {
        if (options.version) {
            print(version)
            App.exit(0)
        }
        if (options.emulate) {
            localPlatform = options.emulate
        } else {
            localPlatform =  Config.OS.toLower() + '-' + Config.CPU
        }
        let [os, arch] = localPlatform.split('-') 
        local = {
            name: localPlatform,
            os: os
            arch: arch,
            like: like(os),
        }
        if (options.debug) {
            options.profile = 'debug'
        }
        if (options.release) {
            options.profile = 'release'
        }
        if (args.rest.contains('configure')) {
            options.config = '.'
        } else if (options.config) {
            args.rest.push('configure')
        }
        if (args.rest.contains('generate')) {
            if (local.like == 'windows') {
                options.gen = ['sh', 'nmake', 'vs']
            } else {
                options.gen = ['sh', 'make']
            }
        } else if (options.gen) {
            args.rest.push('generate')
        }
        if (args.rest.contains('import')) {
            options.import = true
        }
        if (options.profile && !options.config) {
            App.log.error('Can only set profile when configuring via --config dir')
            usage()
        }
        if (options.log) {
            App.log.redirect(options.log)
            App.mprLog.redirect(options.log)
        }
        out = (options.out) ? File(options.out, 'w') : stdout
        platforms = options.platform || []
        if (platforms[0] != localPlatform) {
            platforms.insert(0, localPlatform)
        }

        /*
            The --set|unset|with|without switches apply to the previous --platform switch
         */
        let platform = localPlatform
        options.control = {}
        let poptions = options.control[platform] = {}
        for (i = 1; i < App.args.length; i++) {
            let arg = App.args[i]
            if (arg == '--platform' || arg == '-platform') {
                platform = App.args[++i]
                poptions = options.control[platform] = {}
            } else if (arg == '--with' || arg == '-with') {
                poptions['with'] ||= []
                poptions['with'].push(App.args[++i])
            } else if (arg == '--without' || arg == '-without') {
                poptions.without ||= []
                poptions.without.push(App.args[++i])
            } else if (arg == '--set' || arg == '-set') {
                /* Map set to enable */
                poptions.enable ||= []
                poptions.enable.push(App.args[++i])
            } else if (arg == '--unset' || arg == '-unset') {
                /* Map set to disable */
                poptions.disable ||= []
                poptions.disable.push(App.args[++i])
            }
        }
        selectedTargets = args.rest
        bareBit.options = options
    }

    /*  
        Configure and initialize for building. This generates platform specific bit files.
     */
    function configure() {
        this.src = Path(options.config)
        for each (platform in platforms) {
            vtrace('Init', platform)
            currentPlatform = platform
            let [os, arch] = platform.split('-') 
            global.bit = bit = bareBit.clone(true)
            let bits = src.join('bits/standard.bit').exists ?  src.join('bits') : Config.LibDir.join('bits')
            bit.dir.bits = bits;
            bit.dir.src = Path(src)
            bit.dir.top = Path('.')
            bit.platform = { name: platform, os: os, arch: arch, like: like(os), dist: dist(os) }
            bit.settings.profile = options.profile || 'debug'
            bit.emulating = options.emulate
            /* Read to get settings */
            loadWrapper(bits.join('standard.bit'))
            /* Fix bit.dirs to be paths */
            setTypes()
            loadWrapper(bit.dir.bits.join('os/' + os + '.bit'))
            loadWrapper(src.join('product.bit'))
            applyProfile()
            makeDirsAbsolute()
            applyCommandLineOptions(platform)
            applyEnv()
            expandTokens(bit)
            makePathsAbsolute()
            setTypes()
            setPathEnvVar()
            findPacks()
            makeOutDirs()
            makeBitFile(platform)
            makeBuildConfig(platform)
            importPacks()
            cross = true
        }
    }

    /*
        Make a platform specific bit file
     */
    function makeBitFile(platform) {
        nbit = {}
        if (platforms.length > 1 && platform == platforms[0]) {
            nbit.cross = platforms.slice(1)
        }
        blend(nbit, {
            blend : [
                Path(bit.dir.bits.join('standard.bit')).absolute,
                Path(bit.dir.bits.join('os/' + bit.platform.os + '.bit')).absolute,
                Path(src.join('product.bit')).absolute,
            ],
            platform: bit.platform,
            dir: { 
                src: src.absolute,
                top: bit.dir.top,
            },
            settings: bit.settings,
            packs: bit.packs,
        })
        if (envSettings) {
            blend(nbit, envSettings, {combine: true})
        }
        nbit.platform.like = like(bit.platform.os)
        if (bit.dir.bits != Config.LibDir.join('bits')) {
            nbit.dir.bits = bit.dir.bits
        }
        if (bit.env) {
            nbit.env = bit.env
        }
        for (let [tname,target] in bit.targets) {
            if (target.built) {
                nbit.targets ||= {}
                nbit.targets[tname] = { built: true}
            }
        }
        Object.sortProperties(nbit.settings);
        let path: Path = Path(platform).joinExt('bit')
        trace('Generate', path)

        let data = '/*\n    ' + platform + '.bit -- Build ' + nbit.settings.title + ' for ' + platform + 
            '\n */\n\nBit.load(' + 
            serialize(nbit, {pretty: true, indent: 4, commas: true, quotes: false}) + ')\n'
        path.write(data)

        if (options.show) {
            trace('Configuration', nbit.settings.title + ' for ' + platform + 
                '\nsettings = ' +
                serialize(nbit.settings, {pretty: true, indent: 4, commas: true, quotes: false}) +
                '\npacks = ' +
                serialize(nbit.packs, {pretty: true, indent: 4, commas: true, quotes: false}))
        }
    }

    /*
        Make a buildConfig.h file.
     */
    function makeBuildConfig(platform) {
        let path = bit.dir.inc.join('buildConfig.h')
        let f = TextStream(File(path, 'w'))
        f.writeLine('/*\n    buildConfig.h -- Build It Configuration Header for ' + platform + '\n\n' +
                '    This header is generated by Bit during configuration.\n' +
                '    You may edit this file, but Bit will overwrite it next\n' +
                '    time configuration is performed.\n */\n')
        writeOldDefinitions(f, platform)
        f.close()
        if (options.gen) {
            let hfile = bit.dir.src.join('projects', 'buildConfig').joinExt(bit.platform.name + '-' + bit.settings.profile)
            path.copy(hfile)
            trace('Generate', 'project header: ' + hfile.relative)
        }

        /*
            FUTURE - transition to bit.h
         */
        if (false) {
            let path = bit.dir.inc.join('bit.h')
            let f = TextStream(File(path, 'w'))
            f.writeLine('/*\n    bit.h -- Build It Configuration Header for ' + platform + '\n\n' +
                    '    This header is generated by Bit during configuration.\n' +
                    '    You may edit this file, but Bit will overwrite it next\n' +
                    '    time configuration is performed.\n */\n')
            writeDefinitions(f, platform)
            f.close()
            if (options.gen) {
                path.copy(bit.dir.src.join('projects', cfg, 'buildConfig').joinExt(platform.name))
            }
        }
    }

    /*
        Create the newer bit.h configuration file
     */
    function writeDefinitions(f: TextStream, platform) {
        let settings = bit.settings

        f.writeLine('#define ' + bit.platform.os.toUpper() + ' 1')
        // f.writeLine('#define BIT_PRODUCT "' + settings.product + '"')
        // f.writeLine('#define BIT_NAME "' + settings.title + '"')
        // f.writeLine('#define BIT_COMPANY "' + settings.company + '"')
        f.writeLine('#define BIT_' + settings.product.toUpper() + ' 1')
        // f.writeLine('#define BIT_VERSION "' + settings.version + '"')
        // f.writeLine('#define BIT_NUMBER "' + settings.buildNumber + '"')

        // f.writeLine('#define BIT_DEBUG ' + (settings.debug ? 1 : 2))
        let ver = settings.version.split('.')
        f.writeLine('#define BIT_MAJOR_VERSION ' + ver[0])
        f.writeLine('#define BIT_MINOR_VERSION ' + ver[1])
        f.writeLine('#define BIT_PATCH_VERSION ' + ver[2])
        f.writeLine('#define BIT_VNUM ' + ((((ver[0] * 1000) + ver[1]) * 1000) + ver[2]))

        f.writeLine('#define BIT_OS "' + bit.platform.os.toUpper() + '"')
        f.writeLine('#define BIT_CPU "' + bit.platform.arch + '"')
        f.writeLine('#define BIT_CPU_ARCH ' + getMprArch(bit.platform.arch))
        // f.writeLine('#define BIT_PROFILE "' + settings.profile + '"')
        f.writeLine('#define BIT_CMD "' + App.args.join(' ') + '"')

        if (bit.platform.like == "posix") {
            f.writeLine('#define BIT_UNIX_LIKE 1')
        } else if (bit.platform.like == "windows") {
            f.writeLine('#define BIT_WIN_LIKE 1')
        }
        for (let [pname, prefix] in bit.prefixes) {
            f.writeLine('#define BIT_PREFIX_' + pname.toUpper() + ' "' + prefix + '"')
        }
        for (let [ename, ext] in bit.ext) {
            f.writeLine('#define BIT_' + ename.toUpper() + ' "' + ext + '"')
        }
        // f.writeLine('#define BIT_CHAR_LEN ' + settings.charlen)
        if (settings.charlen == 1) {
            f.writeLine('#define BIT_CHAR char')
        } else if (settings.charlen == 2) {
            f.writeLine('#define BIT_CHAR short')
        } else if (settings.charlen == 4) {
            f.writeLine('#define BIT_CHAR int')
        }
        for (let [key,value] in bit.settings) {
            if (value is Number) {
                f.writeLine('#define BIT_' + key.toUpper() + ' ' + value)
            } else if (value is Boolean) {
                f.writeLine('#define BIT_' + key.toUpper() + ' ' + (value cast Number))
            } else {
                f.writeLine('#define BIT_' + key.toUpper() + ' "' + value + '"')
            }
        }
        f.write('\n/*\n    Composite Bit Configuration\n */\n#if INFORMATIVE_ONLY\n' +
            serialize(bit, {pretty: true, commas: true, indent: 4, quotes: false}))
        f.write('\n#endif\n')
    }

    function writeOldDefinitions(f: TextStream, platform) {
        let settings = bit.settings

        //  Xcode work-around
        f.writeLine('#undef BLD_LIB_PREFIX')
        f.writeLine('#define BLD_PRODUCT "' + settings.product + '"')
        f.writeLine('#define BLD_NAME "' + settings.title + '"')
        f.writeLine('#define BLD_COMPANY "' + settings.company + '"')
        f.writeLine('#define BLD_' + settings.product.toUpper() + 'PRODUCT 1')
        f.writeLine('#define BLD_VERSION "' + settings.version + '"')
        f.writeLine('#define BLD_NUMBER "' + settings.buildNumber + '"')
        if (settings.charlen) {
            f.writeLine('#define BLD_CHAR_LEN ' + settings.charlen)
        }
        if (settings.charlen == 1) {
            f.writeLine('#define BLD_CHAR char')
        } else if (settings.charlen == 2) {
            f.writeLine('#define BLD_CHAR short')
        } else if (settings.charlen == 4) {
            f.writeLine('#define BLD_CHAR int')
        }
        f.writeLine('#define BLD_DEBUG ' + (settings.profile == 'debug' ? 1 : 0))
        let ver = settings.version.split('.')
        f.writeLine('#define BLD_MAJOR_VERSION ' + ver[0])
        f.writeLine('#define BLD_MINOR_VERSION ' + ver[1])
        f.writeLine('#define BLD_PATCH_VERSION ' + ver[2])
        f.writeLine('#define BLD_VNUM ' + ((((ver[0] * 1000) + ver[1]) * 1000) + ver[2]))
        f.writeLine('#define ' + bit.platform.os.toUpper() + ' 1')
        if (bit.platform.like == "posix") {
            f.writeLine('#define BLD_UNIX_LIKE 1')
        } else if (bit.platform.like == "windows") {
            f.writeLine('#define BLD_WIN_LIKE 1')
        }
        f.writeLine('#define BLD_TYPE "' + settings.profile + '"')
        f.writeLine('#define BLD_CPU "' + bit.platform.arch + '"')
        f.writeLine('#define BIT_CPU_ARCH ' + getMprArch(bit.platform.arch))
        f.writeLine('#define BLD_OS "' + bit.platform.os.toUpper() + '"')

        let args = 'bit ' + App.args.slice(1).join(' ')
        f.writeLine('#define BLD_CONFIG_CMD "' + args + '"')

        //  MOB - this is used in mprModule which does a basename anyway
        if (bit.platform.like == 'windows') {
            f.writeLine('#define BLD_LIB_NAME "' + 'bin' + '"')
        } else {
            f.writeLine('#define BLD_LIB_NAME "' + 'lib' + '"')
        }

        /* Prefixes */
        let base = (settings.name == 'ejs') ? bit.prefixes.productver : bit.prefixes.product
        f.writeLine('#define BLD_CFG_PREFIX "' + bit.prefixes.config + '"')
        f.writeLine('#define BLD_BIN_PREFIX "' + bit.prefixes.bin + '"')
        f.writeLine('#define BLD_DOC_PREFIX "' + base.join('doc') + '"')
        f.writeLine('#define BLD_INC_PREFIX "' + bit.prefixes.include + '"')
        f.writeLine('#define BLD_JEM_PREFIX "' + bit.prefixes.product.join('jems') + '"')
        f.writeLine('#define BLD_LIB_PREFIX "' + bit.prefixes.lib + '"')
        f.writeLine('#define BLD_LOG_PREFIX "' + bit.prefixes.log + '"')
        f.writeLine('#define BLD_MAN_PREFIX "' + base.join('man') + '"')
        f.writeLine('#define BLD_PRD_PREFIX "' + bit.prefixes.product + '"')
        f.writeLine('#define BLD_SAM_PREFIX "' + base.join('samples') + '"')
        f.writeLine('#define BLD_SPL_PREFIX "' + bit.prefixes.spool + '"')
        f.writeLine('#define BLD_SRC_PREFIX "' + bit.prefixes.src + '"')
        f.writeLine('#define BLD_VER_PREFIX "' + bit.prefixes.productver + '"')
        f.writeLine('#define BLD_WEB_PREFIX "' + bit.prefixes.web + '"')

        /* Suffixes */
        //  MOB - migrate to not use "." prefix
        if (bit.ext.exe != '') {
            f.writeLine('#define BLD_EXE ".' + bit.ext.exe + '"')
        } else {
            f.writeLine('#define BLD_EXE ""')
        }
        f.writeLine('#define BLD_SHLIB ".' + bit.ext.shlib + '"')
        f.writeLine('#define BLD_SHOBJ ".' + bit.ext.shobj + '"')
        f.writeLine('#define BLD_LIB ".' + bit.ext.lib + '"')
        f.writeLine('#define BLD_OBJ ".' + bit.ext.obj + '"')

        /* Features */
        if (settings.assert != undefined) {
            f.writeLine('#define BLD_FEATURE_ASSERT ' + (settings.assert ? 1 : 0))
        }
        if (settings.float != undefined) {
            f.writeLine('#define BLD_FEATURE_FLOAT ' + (settings.float ? 1 : 0))
        }
        if (settings.rom != undefined) {
            f.writeLine('#define BLD_FEATURE_ROMFS ' + (settings.rom ? 1 : 0))
        }

        if (settings.auth) {
            if (settings.auth == 'file') {
                f.writeLine('#define BLD_FEATURE_AUTH_FILE 1')
            } else {
                f.writeLine('#define BLD_FEATURE_AUTH_FILE 0')
            }
            if (settings.auth == 'pam' && bit.platform.like == 'posix') {
                f.writeLine('#define BLD_FEATURE_AUTH_PAM 1')
            } else {
                f.writeLine('#define BLD_FEATURE_AUTH_PAM 0')
            }
        }
        if (settings.mdb != undefined) {
            f.writeLine('#define BLD_FEATURE_MDB ' + (settings.mdb ? '1' : '0'))
        }
        if (settings.sdb != undefined) {
            f.writeLine('#define BLD_FEATURE_SDB ' + (settings.sdb ? '1' : '0'))
        }
        if (settings.manager != undefined) {
            f.writeLine('#define BLD_MANAGER "' + settings.manager + '"')
        }
        if (settings.httpPort) {
            f.writeLine('#define BLD_HTTP_PORT ' + settings.httpPort)
        }
        if (settings.sslPort) {
            f.writeLine('#define BLD_SSL_PORT ' + settings.sslPort)
        }
        f.writeLine('#define BLD_CC_DOUBLE_BRACES ' + (settings.hasDoubleBraces ? '1' : '0'))
        f.writeLine('#define BLD_CC_DYN_LOAD ' + (settings.hasDynLoad ? '1' : '0'))
        f.writeLine('#define BLD_CC_EDITLINE ' + (settings.hasLibEdit ? '1' : '0'))
        f.writeLine('#define BLD_CC_MMU ' + (settings.hasMmu ? '1' : '0'))
        f.writeLine('#define BLD_CC_MTUNE ' + (settings.hasMtune ? '1' : '0'))
        f.writeLine('#define BLD_CC_PAM ' + (settings.hasPam ? '1' : '0'))
        f.writeLine('#define BLD_CC_STACK_PROTECTOR ' + (settings.hasStackProtector ? '1' : '0'))
        f.writeLine('#define BLD_CC_SYNC ' + (settings.hasSync ? '1' : '0'))
        f.writeLine('#define BLD_CC_SYNC_CAS ' + (settings.hasSyncCas ? '1' : '0'))
        f.writeLine('#define BLD_CC_UNNAMED_UNIONS ' + (settings.hasUnnamedUnions ? '1' : '0'))
        f.writeLine('#define BLD_CC_WARN_64TO32 ' + (settings.warn64to32 ? '1' : '0'))
        f.writeLine('#define BLD_CC_WARN_UNUSED ' + (settings.warnUnused ? '1' : '0'))

        /* Packs */
        for (let [pname, pack] in bit.packs) {
            if (pname == 'compiler') {
                pname = 'cc'
            }
            if (pack.path) {
                f.writeLine('#define BLD_FEATURE_' + pname.toUpper() + ' 1')
                f.writeLine('#define BLD_' + pname.toUpper() + ' \"' + pack.path.relative + '\"')
            } else {
                f.writeLine('#define BLD_FEATURE_' + pname.toUpper() + ' 0')
            }
        }
    }

    /*
        Apply command line --with/--without --enable/--disable options
     */
    function applyCommandLineOptions(platform) {
        var poptions = options.control[platform]
        if (!poptions) {
            return
        }
        /* Disable/enable was originally --unset|--set */
        for each (field in poptions.disable) {
            bit.settings[field] = false
        }
        for each (field in poptions.enable) {
            let [field,value] = field.split('=')
            if (value == 'true') {
                value = true
            } else if (value == 'false') {
                value = false
            } else if (value.isDigit) {
                value = 0 + value
            }
            if (value == undefined) {
                value = true
            }
            bit.settings[field] = value
        }
        for each (field in poptions['with']) {
            let [field,value] = field.split('=')
            if (value) {
                bit.packs[field] = { enable: true, path: Path(value) }
            }
        }
        for each (field in poptions['without']) {
            if (field == 'all' && bit.settings.minimal) {
                for each (f in bit.settings.minimal) {
                    bit.packs[f] = { enable: false, diagnostic: 'configured --without ' + f }
                }
                continue
            }
            bit.packs[field] = { enable: false, diagnostic: 'configured --without ' + field }
        }
        for each (field in poptions['prefix']) {
            let [field,value] = field.split('=')
            if (value) {
                bit.prefixes[field] = Path(value)
            }
        }
    }

    let envTools = {
        AR: '+lib',
        CC: '+compiler',
        LD: '+linker',
    }

    let envFlags = {
        CFLAGS:  '+compiler',
        DFLAGS:  '+defines',
        IFLAGS:  '+includes',
        LDFLAGS: '+linker',
    }

    /*
        Examine environment for flags and apply
     */
    function applyEnv() {
        if (!cross) return
        envSettings = { packs: {}, defaults: {} }
        for (let [key, tool] in envTools) {
            let path = App.getenv(key)
            if (path) {
                envSettings.packs[tool] ||= {}
                envSettings.packs[tool].path = path
                envSettings.packs[tool].enable = true
            }
        }
        for (let [flag, option] in envFlags) {
            let value = App.getenv(flag)
            if (value) {
                envSettings.defaults[option] ||= []
                envSettings.defaults[option] += value.replace(/^-I/, '').split(' ')
            }
        }
    }

    /*
        Import pack files
     */
    function importPacks() {
        for (let [pname, pack] in bit.packs) {
            for each (file in pack.imports) {
                vtrace('Import', file)
                if (file.extension == 'h') {
                    cp(file, bit.dir.inc)
                } else {
                    cp(file, bit.dir.lib)
                }
            }
        }
    }

    /*
        Apply the selected build profile
     */
    function applyProfile() {
        if (options.profile && bit.profiles) {
            blend(bit, bit.profiles[options.profile], {combine: true})
        }
    }

    /*
        Search for enabled packs in the system
     */
    function findPacks() {
        vtrace('Search', 'Packages: ' + [bit.required + bit.optional].join(' '))
        let packs = (bit.required + bit.optional).sort().unique()
        for each (pack in bit.required + bit.optional) {
            if (bit.packs[pack] && !bit.packs[pack].enable) {
                if (bit.required.contains(pack)) { 
                    throw 'Required pack ' + pack + ' is not enabled'
                }
                continue
            }
            let path = bit.dir.bits.join('packs', pack + '.bit')
            vtrace('Search', 'Pack ' + pack)
            if (!path.exists) {
                for each (d in bit.settings.packs) {
                    path = bit.dir.src.join(d, pack + '.bit')
                    if (path.exists) {
                        break
                    }
                }
            }
            if (path.exists) {
                try {
                    bit.packs[pack] ||= {enable: true}
                    currentPack = pack
                    loadWrapper(path)
                } catch (e) {
                    if (!(e is String)) {
                        App.log.debug(0, e)
                    }
                    let kind = bit.required.contains(pack) ? 'Required' : 'Optional'
                    whyMissing(kind + ' package "' + pack + '" ' + e)
                    bit.packs[pack] = { enable: false, diagnostic: "" + e }
                    if (kind == 'Required') {
                        throw e
                    }
                }
            } else {
                throw "Unknown package " + path
            }
            if (options.verbose) {
                if (bit.packs[pack] && bit.packs[pack].enable && bit.packs[pack].path) {
                    trace('Probe', pack + ' found at ' + bit.packs[pack].path)
                } else {
                    trace('Probe', pack + ' not found')
                }
            }
        }
    }

    /*
        Probe for a file and locate
     */
    public function probe(file: Path, control = {}): Path {
        let path: Path
        if (!file.exists) {
            let search = []
            let dir
            if (dir = bit.packs[currentPack].path) {
                search.push(dir)
            }
            if (control.search) {
                if (!(control.search is Array)) {
                    control.search = [control.search]
                }
                search += control.search
            }
            App.log.debug(2,"Probe for " + file + ' in ' + search)
            for each (let s: Path in search) {
                App.log.debug(2, "Probe for " + s.join(file) + ' exists: ' + s.join(file).exists)
                if (s.join(file).exists) {
                    path = s.join(file)
                    break
                }
            }
            path ||= Cmd.locate(file)
        }
        if (!path) {
            if (!control.nothrow) {
                throw 'File ' + file + ' not found for package ' + currentPack
            }
            return null
        }
        App.log.debug(2, 'Probe for ' + file + ' found at ' + path)
        if (control.fullpath) {
            return path
        }
        let pat = RegExp('.' + file.toString().replace(/[\/\\]/g, '.') + '$')
        return path.toString().replace(pat, '')
    }

    /*
        Main processing loop. Used for building and generation.
     */
    function process(path: Path) {
        if (!path) {
            let file = findLocalBitFile()
            App.log.debug(1, 'Change directory to ' + file.dirname)
            App.chdir(file.dirname)
            home = App.dir
            path = file.basename
        }
        global.bit = bit = bareBit.clone(true)
        bit.dir.bits = Config.LibDir.join('bits')
        if (options.profile) {
            bit.settings.profile = options.profile
        }
        loadWrapper(path)

        loadModules()
        applyProfile()
        makeDirsAbsolute()

        let startPlatform = bit.platform.os + '-' + bit.platform.arch
        currentPlatform = startPlatform
        this.src = bit.dir.src

        prepBuild()
        if (selectedTargets[0] == 'version') {
            print(bit.settings.version + '-' + bit.settings.buildNumber)
            return
        }

        if (options.verbose) {
            vtrace('Build', currentPlatform + '-' + bit.settings.profile + ': ' + 
                    ((selectedTargets != '') ? selectedTargets: 'nothing to do'))
        } else {
            trace('Build', currentPlatform + '-' + bit.settings.profile)
        }
        build()

        if (!generating) {
            //  MOB - should have a variable for this
            trace('Complete', currentPlatform + '-' + bit.settings.profile)
        }

        /*
            Do any required cross building
         */
        for each (platform in bit.cross) {
            if (platform == startPlatform) continue
            cross = true
            currentPlatform = platform
            process(Path(platform).joinExt('bit'))
        }
    }

    public function loadModules() {
        App.log.debug(2, "Bit Modules: " + serialize(bit.modules, {pretty: true}))
        for each (let module in bit.modules) {
            App.log.debug(2, "Load bit module: " + module)
            try {
                global.load(module)
            } catch (e) {
                throw new Error('When loading: ' + module + '\n' + e)
            }
        }
    }

    /*
        Load a bit file
     */
    public function loadWrapper(path) {
        let saveCurrent = currentBitFile
        try {
            currentBitFile = path
            vtrace('Loading', currentBitFile)
            global.load(path)
        } finally {
            currentBitFile = saveCurrent
        }
    }

    function rebase(home: Path, o: Object, field: String) {
        if (o[field] is Array) {
            for (i in o[field]) {
                if (!o[field][i].startsWith('${')) {
                    o[field][i] = home.join(o[field][i])
                }
            }
        } else if (o[field]) {
            if (!o[field].startsWith('${')) {
                o[field] = home.join(o[field])
            }
        }
    }

    /*
        Change paths in a bit file to be relative to the bit file
     */
    function fixup(o) {
        let home = currentBitFile.dirname
        for (i in o.modules) {
            o.modules[i] = home.join(o.modules[i])
        }
        for (i in o['+modules']) {
            o['+modules'][i] = home.join(o['+modules'][i])
        }
        //  Functionalize
        if (o.defaults) {
            rebase(home, o.defaults, 'includes')
            rebase(home, o.defaults, '+includes')
            for (let [when,item] in o.defaults.scripts) {
                if (item is String) {
                    o.defaults.scripts[when] = [{ home: home, script: item }]
                } else {
                    item.home ||= home
                }
            }
        }
        if (o.internal) {
            rebase(home, o.internal, 'includes')
            rebase(home, o.internal, '+includes')
            for (let [when,item] in o.internal.scripts) {
                if (item is String) {
                    o.internal.scripts[when] = [{ home: home, script: item }]
                } else {
                    item.home ||= home
                }
            }
        }
        for (let [tname,target] in o.targets) {
            target.name ||= tname
            target.home ||= home
            if (target.path) {
                //  MOB - functionalize this
                if (!target.path.startsWith('${')) {
                    target.path = target.home.join(target.path)
                }
            }
            rebase(home, target, 'includes')
            rebase(home, target, '+includes')
            rebase(home, target, 'headers')
            rebase(home, target, 'sources')
            rebase(home, target, 'files')

            /* Convert strings scripts into an array of scripts structures */
            for (let [when,item] in target.scripts) {
                if (item is String) {
                    item = { script: item }
                    target.scripts[when] = [item]
                    item.home ||= home
                } else if (item is Array) {
                    item[0].home ||= home
                } else {
                    item.home ||= home
                }
            }
            if (target.build) {
                /*
                    Build scripts run at 'build' time. They have a type of 'script' so they run by default 
                 */
                target.type ||= 'script'
                target.scripts ||= {}
                target.scripts['build'] ||= []
                target.scripts['build'] += [{ home: home, script: target.build }]
                delete target.build
            }
            if (target.action) {
                target.type ||= 'action'
                //  MOB - refactor
                if (true || targetsToBlend[target.type]) {
                    /*
                        Actions do not run at 'build' time. They have a type of 'action' so they do not run by default
                        unless requested as an action on the command line AND they don't have the same type as a target. 
                     */
                    target.scripts ||= {}
                    target.scripts['build'] ||= []
                    target.scripts['build'] += [{ home: home, script: target.action }]
                    delete target.action
                }
            }

            /*
                Blend internal for only the targets in this file
             */
            if (o.internal) {
                blend(target, o.internal, {combine: true})
            }
            if (target.inherit) {
                blend(target, o[target.inherit], {combine: true})
            }
        }
    }

    /*
        Load a bit file object
     */
    public function loadInternal(o) {
        if (simpleLoad) {
            blend(bit, o)
            return
        }
        let home = currentBitFile.dirname
        fixup(o)
        /* 
            Blending is depth-first. Blend this bit object after loading blend references.
            Save the blend[] property for the current bit object
            Special case for the local plaform bit file to provide early definition of platform and dir properties
         */
        if (bit.dir && !bit.dir.top) {
            if (o.dir) {
                blend(bit.dir, o.dir, {combine: true})
            }
            if (o.platform) {
                blend(bit.platform, o.platform, {combine: true})
            }
            applyCommandLineOptions(localPlatform)
        }
        let toBlend = blend({}, o, {combine: true})
        for each (path in toBlend.blend) {
            bit.BITS = bit.dir.bits
            path = path.expand(bit, {fill: '.'})
            loadWrapper(home.join(path))
        }
        bit = blend(bit, o, {combine: true})
        for (let [tname, target] in o.targets) {
            /* Overwrite targets with original unblended target. This delays blending to preserve +/-properties  */  
            bit.targets[tname] = target
        }
        expandTokens(bit)
    }

    function findLocalBitFile() {
        let name = Path(localPlatform + '.bit').joinExt('bit')
        let base: Path = currentBitFile || '.'
        for (let d: Path = base; d.parent != d; d = d.parent) {
            let f: Path = d.join(name)
            if (f.exists) {
                return f
            }
        }
        throw 'Can\'t find ' + name + '. Run "configure" or "bit configure" first.'
        return null
    }

    /*
        Generate projects
     */
    function generate() {
        selectedTargets = defaultTargets
        if (generating) return
        gen = {
            platform:   bit.platform.name + '-' + bit.settings.profile
            compiler:   bit.defaults.compiler.join(' '),
            defines:    bit.defaults.defines.join(' '),
            includes:   bit.defaults.includes.map(function(e) '-I' + e).join(' '),
            linker:     bit.defaults.linker.join(' '),
            libraries:  mapLibs(bit.defaults.libraries).join(' ')
        }
        let base = bit.dir.projects.join(localPlatform + '-' + bit.settings.profile)

        for each (item in options.gen) {
            generating = item
            if (generating == 'sh') {
                generateShell(base)
            } else if (generating == 'make') {
                generateMake(base)
            } else if (generating == 'nmake') {
                generateNmake(base)
            } else if (generating == 'vstudio' || generating == 'vs') {
                generateVstudio(base)
            } else if (generating == 'xcode') {
                generateXcode(base)
            } else {
                throw 'Unknown generation format: ' + generating
            }
            for each (target in bit.targets) {
                target.built = false
            }
        }
        generating = null
    }

    function generateShell(base: Path) {
        trace('Generate', 'project file: ' + base.relative + '.sh')
        let path = base.joinExt('sh')
        genout = TextStream(File(path, 'w'))
        genout.writeLine('#\n#   build.sh -- Build It Shell Script to build ' + bit.settings.title + '\n#\n')
        genout.writeLine('PLATFORM="' + bit.platform.name + '-' + bit.settings.profile + '"')
        genout.writeLine('CC="' + bit.packs.compiler.path + '"')
        let os = bit.platform.os.toUpper()
        genout.writeLine('CFLAGS="' + gen.compiler + '"')
        genout.writeLine('DFLAGS="' + gen.defines + '"')
        genout.writeLine('IFLAGS="' + bit.defaults.includes.map(function(path) '-I' + path.relative).join(' ') + '"')
        genout.writeLine('LDFLAGS="' + platformReplace(gen.linker).replace(/\$ORIGIN/g, '$$$$ORIGIN' + '"'))
        genout.writeLine('LIBS="' + gen.libraries + '"\n')
        genEnv()
        genout.writeLine('[ ! -x ${PLATFORM}/inc ] && ' + 
            'mkdir -p ${PLATFORM}/inc ${PLATFORM}/obj ${PLATFORM}/lib ${PLATFORM}/bin')
        genout.writeLine('[ ! -f ${PLATFORM}/inc/buildConfig.h ] && ' + 
            'cp projects/buildConfig.${PLATFORM} ${PLATFORM}/inc/buildConfig.h\n')
        build()
        genout.close()
        path.setAttributes({permissions: 0755})
    }

    function generateMake(base: Path) {
        trace('Generate', 'project file: ' + base.relative + '.mk')
        let path = base.joinExt('mk')
        genout = TextStream(File(path, 'w'))
        //  MOB - change build.* name
        genout.writeLine('#\n#   build.mk -- Build It Makefile to build ' + bit.settings.title + 
            ' for ' + bit.platform.os + ' on ' + bit.platform.arch + '\n#\n')
        genout.writeLine('PLATFORM  := ' + bit.platform.name + '-' + bit.settings.profile)
        genout.writeLine('CC        := ' + bit.packs.compiler.path)
        let os = bit.platform.os.toUpper()
        genout.writeLine('CFLAGS    := ' + gen.compiler)
        genout.writeLine('DFLAGS    := ' + gen.defines)
        genout.writeLine('IFLAGS    := ' + 
            platformReplace(bit.defaults.includes.map(function(path) '-I' + path.relative).join(' ')))
        genout.writeLine('LDFLAGS   := ' + platformReplace(gen.linker).replace(/\$ORIGIN/g, '$$$$ORIGIN'))
        genout.writeLine('LIBS      := ' + gen.libraries + '\n')
        genEnv()
        genout.writeLine('\nall: prep \\\n        ' + genAll())
        genout.writeLine('.PHONY: prep\n\nprep:')
        genout.writeLine('\t@[ ! -x $(PLATFORM)/inc ] && ' + 
            'mkdir -p $(PLATFORM)/inc $(PLATFORM)/obj $(PLATFORM)/lib $(PLATFORM)/bin ; true')
        genout.writeLine('\t@[ ! -f $(PLATFORM)/inc/buildConfig.h ] && ' + 
            'cp projects/buildConfig.$(PLATFORM) $(PLATFORM)/inc/buildConfig.h ; true\n')
        genout.writeLine('clean:')
        action('cleanTargets')
        genout.writeLine('\nclobber: clean\n\trm -fr ./$(PLATFORM)\n')
        build()
        genout.close()
    }

    function generateNmake(base: Path) {
        trace('Generate', 'project file: ' + base.relative + '.nmake')
        let path = base.joinExt('nmake')
        genout = TextStream(File(path, 'w'))
        //  MOB - change build.* name
        genout.writeLine('#\n#   build.nmake -- Build It Makefile to build ' + bit.settings.title + 
            ' for ' + bit.platform.os + ' on ' + bit.platform.arch + '\n#\n')

        // genEnv()
        genout.writeLine('VS        = $(PROGRAMFILES)\\Microsoft Visual Studio 10.0')
        genout.writeLine('SDK       = $(PROGRAMFILES)\\Microsoft SDKs\\Windows\\v7.0A')
        genout.writeLine('INCLUDE   = $(INCLUDE);$(VS)\\VC\\INCLUDE;$(SDK)\\INCLUDE')
        genout.writeLine('LIB       = $(LIB);$(VS)\\VC\\lib;$(SDK)\\lib')
        genout.writeLine('PATH      = $(VS)\\Bin;$(VS)\\VC\\Bin;$(VS)\\Common7\\IDE;$(VS)\\Common7\\Tools;$(VS)\\SDK\\v3.5\\bin;$(VS)\\VC\\VCPackages;$(PATH)\n')

        genout.writeLine('PLATFORM  = ' + bit.platform.name + '-' + bit.settings.profile)
        genout.writeLine('CC        = ' + bit.packs.compiler.path)
        let os = bit.platform.os.toUpper()
        genout.writeLine('CFLAGS    = ' + gen.compiler)
        genout.writeLine('DFLAGS    = ' + gen.defines)
        genout.writeLine('IFLAGS    = ' + 
            platformReplace(bit.defaults.includes.map(function(path) '-I' + path.relative).join(' ')))

//  MOB -- need this in generateMake and generateShell

        genout.writeLine('LDFLAGS   = ' + 
            platformReplace(gen.linker).replace(/\$ORIGIN/g, '$$$$ORIGIN').replace(/\//g, '\\'))
        genout.writeLine('LIBS      = ' + gen.libraries + '\n')
        genout.writeLine('\nall: prep \\\n        ' + genAll())
        genout.writeLine('.PHONY: prep\n\nprep:')
        genout.writeLine('\tif not exist $(PLATFORM)\\inc mkdir $(PLATFORM)\\inc')
        genout.writeLine('\tif not exist $(PLATFORM)\\obj mkdir $(PLATFORM)\\obj')
        genout.writeLine('\tif not exist $(PLATFORM)\\bin mkdir $(PLATFORM)\\bin')
        genout.writeLine('\tif not exist $(PLATFORM)\\inc\\buildConfig.h ' +
            'copy projects\\buildConfig.$(PLATFORM) $(PLATFORM)\\inc\\buildConfig.h\n')
        genout.writeLine('clean:')
        action('cleanTargets')
        genout.writeLine('')
        build()
        genout.close()
    }

    function generateVstudio(base: Path) {
        trace('Generate', 'project file: ' + base.relative)
        mkdir(base)
        global.load(bit.dir.bits.join('vstudio.es'))
        vstudio(base)
    }

    function generateXcode(base: Path) {
        mkdir(base)
        global.load(bit.dir.bits.join('xcode.es'))
        xcode(base)
    }

    function genEnv() {
        for (let [key,value] in bit.env) {
            if (value is Array) {
                value = value.join(App.SearchSeparator)
            }
            if (generating == 'make') {
                genout.writeLine('export ' + key + ' := ' + value)

            } else if (generating == 'nmake') {
                genout.writeLine(key + ' = ' + value)

            } else if (generating == 'sh') {
                genout.writeLine('export ' + key + '="' + value + '"')
            }
        }
    }

    function genAll() {
        let all = []
        for each (tname in selectedTargets) {
            let target = bit.targets[tname]
            if (target.path && target.enable) {
                all.push(platformReplace(target.path.relative))
            }
        }
        return all.join(' \\\n        ') + '\n'
    }

    function import() {
        if (Path('bits').exists) {
            throw 'Current directory already contains a bits directory'
        }
        cp(Config.LibDir.join('bits'), 'bits')
        if (!Path('product.bit').exits) {
            mv('bits/sample.bit', 'product.bit')
        }
        print('Initialization complete.')
        print('Edit product.bit and run "bit configure" to prepare for building.')
        print('Then run "bit" to build.')
    }

    function prepBuild() {
        if (!bit.dir.inc.join('buildConfig.h').exists && args.rest[0] != 'clobber') {
            throw 'Can\'t load buildConfig.h. Run configure or "bit configure".'
        }
        /* 
            When cross generating, certain wild cards can't be resolved.
            Setting missing to empty will cause missing glob patterns to be replaced with the pattern itself 
         */
        missing = ''
        setTypes()
        expandTokens(bit)
        setConstVars()
        expandTokens(bit)
        makePathsAbsolute()
        applyCommandLineOptions(currentPlatform)
        applyEnv()
        enableTargets()
        selectTargets()
        blendDefaults()
        resolveDependencies()
        expandWildcards()
        setTargetPaths()
        setTypes()
        setPathEnvVar()
        makeOutDirs()
        Object.sortProperties(bit);

        if (options.save) {
            delete bit.blend
            options.save.write(serialize(bit, {pretty: true, commas: true, indent: 4, quotes: false}))
            trace('Save', 'Combined Bit files to: ' + options.save)
            App.exit()
        }
    }

    /*
        Determine which targets are enabled for building on this platform
     */
    function enableTargets() {
        for (let [tname, target] in bit.targets) {
            if (target.enable) {
                if (!(target.enable is Boolean)) {
                    let script = target.enable.expand(bit, {fill: ''}).replace(/\\/g, '\\\\')
                    if (!eval(script)) {
                        vtrace('Skip', 'Target ' + tname + ' is disabled on this platform') 
                        target.enable = false
                    } else {
                        target.enable = true
                    }
                }
                target.name ||= tname
            } else if (target.enable == undefined) {
                target.enable = true
            }
            if (target.platforms) {
                if (!target.platforms.contains(currentPlatform) &&
                    !(currentPlatform == localPlatform && target.platforms.contains('local')) &&
                    !(currentPlatform != localPlatform && target.platforms.contains('cross'))) {
                        target.enable = false
                }
            }
        }
    }

    /*
        Select the targets to build 
     */
    function selectTargets() {
        defaultTargets = []
        for (let [tname,target] in bit.targets) {
            if (targetsToBuildByDefault[target.type]) {
                defaultTargets.push(tname)
            }
        }
        if (selectedTargets.length == 0) {
            /* No targets specified, so do a default "build" */
            selectedTargets = defaultTargets

        } else {
            /* Targets specified. If "build" is one of the targets|actions, expand it to explicit target names */
            let index = selectedTargets.indexOf('build')
            if (index >= 0) {
                let names = []
                for (let [tname,target] in bit.targets) {
                    if (targetsToBuildByDefault[target.type]) {
                        names.push(tname)
                    }
                }
                selectedTargets.splice(index, 1, ...names)
            }
        }
        if (!options.config) {
            selectedTargets = selectedTargets.sort()
        }
        for (let [index, name] in selectedTargets) {
            /* Select target by target type */
            let add = []
            for each (t in bit.targets) {
                if (t.type == name) {
                    if (!selectedTargets.contains(t.name)) {
                        add.push(t.name)
                    }
                    break
                }
            }
            if (!bit.targets[name] && add.length == 0) {
                throw 'Unknown target ' + name
            }
            selectedTargets += add
        }
        vtrace('Targets', selectedTargets)
    }

    /*
        Set target output paths. Uses the default locations for libraries, executables and files
     */
    function setTargetPaths() {
        for each (target in bit.targets) {
            if (!target.path) {
                if (target.type == 'lib') {
                    target.path = bit.dir.lib.join(target.name).joinExt(bit.ext.shobj, true)
                } else if (target.type == 'obj') {
                    target.path = bit.dir.obj.join(target.name).joinExt(bit.ext.obj, true)
                } else if (target.type == 'exe') {
                    target.path = bit.dir.bin.join(target.name).joinExt(bit.ext.exe, true)
                } else if (target.type == 'file') {
                    target.path = bit.dir.lib.join(target.name)
                }
            }
            if (target.path) {
                target.path = Path(target.path.toString().expand(bit, {fill: '${}'}))
            }
        }
    }

    /*
        Build a file list and apply include/exclude filters
     */
    function buildFileList(include, exclude = null) {
        let files
        if (include is RegExp) {
            //  MOB - should be relative to the bit file that created this
            files = Path(src).glob('*', {include: include, missing: missing})
        } else {
            if (!(include is Array)) {
                include = [ include ]
            }
            files = []
            for each (pattern in include) {
                files += Path('.').glob(pattern, {missing: missing})
            }
        }
        if (exclude) {
            if (exclude is RegExp) {
                files = files.reject(function (elt) elt.match(exclude)) 
            } else if (exclude is Array) {
                for each (pattern in exclude) {
                    files = files.reject(function (elt) { return elt.match(pattern); } ) 
                }
            } else {
                files = files.reject(function (elt) elt.match(exclude))
            }
        }
        return files
    }

    /*
        Resolve a target by inheriting dependent libraries
     */
    function resolve(target) {
        if (target.resolved) {
            return
        }
        target.resolved = true
        for each (dname in target.depends) {
            let dep = bit.targets[dname]
            if (dep) {
                if (!dep.enable) continue
                if (!dep.resolved) {
                    resolve(dep)
                }
                if (dep.type == 'lib') {
                    target.libraries
                    target.libraries ||= []
                    target.libraries.push(dname.replace(/^lib/, ''))
                    for each (lib in dep.libraries) {
                        if (!target.libraries.contains(lib)) {
                            target.libraries.push(lib)
                        }
                    }
                    for each (option in dep.linker) {
                        target.linker ||= []
                        if (!target.linker.contains(option)) {
                            target.linker.push(option)
                        }
                    }
                }
            } else {
                let pack = bit.packs[dname]
                if (pack) {
                    if (!pack.enable) continue
                    if (pack.includes) {
                        target.includes ||= []
                        target.includes += pack.includes
                    }
                    if (pack.defines) {
                        target.defines ||= []
                        target.defines += pack.defines
                    }
                    if (pack.libraries) {
                        target.libraries ||= []
                        target.libraries += pack.libraries
                    }
                    if (pack.linker) {
                        target.linker ||= []
                        target.linker += pack.linker
                    }
                }
            }
        }
        runScript(target, 'preresolve')
    }

    function resolveDependencies() {
        for each (target in bit.targets) {
            resolve(target)
        }
        for each (target in bit.targets) {
            delete target.resolved
        }
    }

    /*
        Expand target.sources and target.headers. Support include+exclude and create target.files[]
     */
    function expandWildcards() {
        let index
        for each (target in bit.targets) {
            runScript(target, 'presource')
            if (target.files) {
                target.files = buildFileList(target.files)
            }
            if (target.headers) {
                /*
                    Create a target for each header file
                 */
                target.files ||= []
                let files = buildFileList(target.headers, target.exclude)
                for each (file in files) {
                    let header = bit.dir.inc.join(file.basename)
                    /* Always overwrite dynamically created targets created via makeDepends */
                    bit.targets[header] = { name: header, enable: true, path: header, type: 'header', files: [ file ] }
                    target.depends ||= []
                    target.depends.push(header)
                }
            }
            if (target.sources) {
                target.files ||= []
                let files = buildFileList(target.sources, target.exclude)
                for each (file in files) {
                    /*
                        Create a target for each source file
                     */
                    let obj = bit.dir.obj.join(file.replaceExt(bit.ext.obj).basename)
                    let objTarget = { name : obj, enable: true, path: obj, type: 'obj', files: [ file ], 
                        compiler: target.compiler, defines: target.defines, includes: target.includes }
                    if (bit.targets[obj]) {
                        objTarget = blend(bit.targets[objTarget.name], objTarget, {combined: true})
                    } else {
                        bit.targets[objTarget.name] = objTarget
                    }
                    target.files.push(obj)
                    target.depends ||= []
                    target.depends.push(obj)

                    /*
                        Create targets for each header (if not already present)
                     */
                    objTarget.depends = makeDepends(objTarget)
                    for each (header in objTarget.depends) {
                        if (!bit.targets[header]) {
                            bit.targets[header] = { name: header, enable: true, path: header, 
                                type: 'header', files: [ header ] }
                        }
                    }
                }
            }
        }
    }

    /*
        Blend bit.defaults into targets
     */
    function blendDefaults() {
        if (bit.defaults) {
            runScript(bit.defaults.scripts, 'preblend')
        }
        for (let [tname, target] in bit.targets) {
            if (targetsToBlend[target.type]) {
                let def = blend({}, bit.defaults, {combine: true})
                target = bit.targets[tname] = blend(def, target, {combine: true})
                runScript(target.scripts, 'postblend')
                if (target.scripts && target.scripts.preblend) {
                    delete target.scripts.preblend
                }
                if (target.type == 'obj') { 
                    delete target.linker 
                    delete target.libraries 
                }
            }
        }
    }

    /*
        Make directories absolute. This allows them to be used by any other bit file.
     */
    function makeDirsAbsolute() {
        for (let [key,value] in bit.dir) {
            bit.dir[key] = Path(value).absolute
        }
        if (bit.defaults) {
            for (let [key,value] in bit.defaults.includes) {
                bit.defaults.includes[key] = Path(value).absolute
            }
        }
    }

    /*
        Make target paths absolute
     */
    function makePathsAbsolute() {
        for (let [key,value] in bit.blend) {
            bit.blend[key] = Path(value).absolute
        }
        for each (target in bit.targets) {
            if (target.path) {
                target.path = Path(target.path).absolute
            }
        }
    }

    /*
        Set types of bit fields. This ensures paths are Paths. 
        NOTE: this is called multiple times during the blending process
     */
    function setTypes() {
        for (let [key,value] in bit.dir) {
            bit.dir[key] = Path(value)
        }
        for each (target in bit.targets) {
            if (target.path) {
                target.path = Path(target.path)
            }
        }
        for each (pack in bit.packs) {
            if (pack.dir) {
                pack.dir = Path(pack.dir)
            }
            if (pack.path) {
                pack.path = Path(pack.path)
            }
            for (i in pack.includes) {
                pack.includes[i] = Path(pack.includes[i])
            }
        }
        for (let [pname, prefix] in bit.prefixes) {
            bit.prefixes[pname] = Path(prefix)
        }
    }

    /*
        Build all selected targets
     */
    function build() {
        for each (name in selectedTargets) {
            let target = bit.targets[name]
            if (target && target.enable) {
                buildTarget(target)
            }
            for each (t in bit.targets) {
                if (t.type == name) {
                    if (t.enable) {
                        buildTarget(t)
                    }
                }
            }
        }
    }

    /*
        Build a target and all required dependencies (first)
     */
    function buildTarget(target) {
        if (target.built || !target.enable) {
            return
        }
        if (target.building) {
            throw 'Possible recursive dependancy: target ' + target.name + ' is already building'
        }
        target.building = true
        bit.target = target
        target.linker ||= []
        target.includes ||= []
        target.libraries ||= []

        runScript(target.scripts, 'predependencies')
        for each (dname in target.depends) {
            let dep = bit.targets[dname]
            if (!dep) {
                if (dname == 'build') {
                    for each (tname in defaultTargets) {
                        buildTarget(bit.targets[tname])
                    }
                } else if (!Path(dname).exists) {
                    if (!bit.packs[dname]) {
                        print('Unknown dependency "' + dname + '" in target "' + target.name + '"')
                        return
                    }
                }
            } else {
                if (!dep.enable || dep.built) {
                    continue
                }
                if (dep.building) {
                    throw 'Possible recursive dependancy in target ' + target.name + 
                        ', dependancy ' + dep.name + ' is already building.'
                }
                buildTarget(dep)
            }
        }
        if (target.message) {
            trace('Info', target.message)
        }
        bit.target = target

        if (target.type == 'lib') {
            buildLib(target)
        } else if (target.type == 'exe') {
            buildExe(target)
        } else if (target.type == 'obj') {
            buildObj(target)
        } else if (target.type == 'file') {
            buildFile(target)
        } else if (target.type == 'header') {
            buildFile(target)
        } else if (target.type == 'script') {
            buildScript(target)
        } else if (target.scripts && target.scripts['build']) {
            buildScript(target)
        } else if (target.type == 'generate') {
            generate()
        } else {
            if (target.scripts && target.scripts.build) {
                buildScript(target)
            }
        }
        target.building = false
        target.built = true
    }

    /*
        Build an executable program
     */
    function buildExe(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        // diagnose('Building:\n' + target.path + ' = ' + serialize(target, {pretty: true}))
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        let transition = target.rule || 'exe'
        let rule = bit.rules[transition]
        if (!rule) {
            throw 'No rule to build target ' + target.path + ' for transition ' + transition
            return
        }
        setRuleVars(target, 'exe')

        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        diagnose(2, command)
        if (generating == 'sh') {
            command = genReplace(command)
            genout.writeLine(command + '\n')

        } else if (generating == 'make') {
            command = genReplace(command)
            genout.writeLine(platformReplace(target.path.relative) + ': ' + platformReplace(getTargetDeps(target)) +
                '\n\t' + command + '\n')

        } else if (generating == 'nmake') {
            command = genReplace(command)
            genout.writeLine(platformReplace(target.path.relative) + ': ' + platformReplace(getTargetDeps(target)) +
                '\n\t' + command + '\n')

        } else {
            trace('Link', target.name)
            run(command)
        }
    }

    /*
        Build a library
     */
    function buildLib(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        buildSym(target)
        let transition = target.rule || 'lib'
        let rule = bit.rules[transition]
        if (!rule) {
            throw 'No rule to build target ' + target.path + ' for transition ' + transition
            return
        }
        setRuleVars(target, 'lib')

        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        if (generating == 'sh') {
            command = genReplace(command)
            genout.writeLine(command + '\n')

        } else if (generating == 'make') {
            command = genReplace(command)
            genout.writeLine(platformReplace(target.path.relative) + ': ' + 
                platformReplace(getTargetDeps(target)) + '\n\t' + command + '\n')

        } else if (generating == 'nmake') {
            command = genReplace(command)
            genout.writeLine(platformReplace(target.path.relative) + ': ' + 
                platformReplace(getTargetDeps(target)) + '\n\t' + command + '\n')

        } else {
            trace('Link', target.name)
            run(command)
        }
    }

    /*
        Build symbols file for windows libraries
     */
    function buildSym(target) {
        let rule = bit.rules['sym']
        if (!rule || generating) {
            return
        }
        bit.IN = target.files.join(' ')
        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        trace('Symbols', target.name)
        let data = run(command, {noshow: true})
        let result = []
        let lines = data.match(/SECT.*External *\| .*/gm)
        for each (l in lines) {
            if (l.contains('__real')) continue
            let sym = l.replace(/.*\| _/, '').replace(/\r$/,'')
            result.push(sym)
        }
        let def = Path(target.path.toString().replace(/dll$/, 'def'))
        def.write('LIBRARY ' + target.name + '.dll\nEXPORTS\n  ' + result.sort().join('\n  '))
    }

    /*
        Build an object from source
     */
    function buildObj(target) {
        if (!stale(target)) {
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        let ext = target.path.extension
        for each (file in target.files) {
            let transition = file.extension + '->' + target.path.extension
            let rule = target.rule || bit.rules[transition]
            if (!rule) {
                rule = bit.rules[target.path.extension]
                if (!rule) {
                    throw 'No rule to build target ' + target.path + ' for transition ' + transition
                    return
                }
            }
            setRuleVars(target, 'obj', file)
            bit.PREPROCESS = ''
            bit.OUT = target.path
            bit.IN = file
            bit.CFLAGS = (target.compiler) ? target.compiler.join(' ') : ''
            bit.DEFINES = (target.defines) ? target.defines.join(' ') : ''
            bit.INCLUDES = (target.includes) ? target.includes.map(function(path) '-I' + path.relative) : ''
            bit.ARCH = bit.platform.arch

            let command = rule.expand(bit, {fill: ''})
//  MOB - just to allow tokens in target.defines
command = command.expand(bit, {fill: ''})

            if (generating == 'sh') {
                command = genReplace(command)
                genout.writeLine(command + '\n')

            } else if (generating == 'make') {
                command = genReplace(command)
                genout.writeLine(platformReplace(target.path.relative) + ': \\\n        ' + 
                    file.relative + platformReplace(getTargetDeps(target)) + '\n\t' + command + '\n')

            } else if (generating == 'nmake') {
                command = genReplace(command)
                genout.writeLine(platformReplace(target.path.relative) + ': \\\n        ' + 
                    file.relative.windows + platformReplace(getTargetDeps(target)) + '\n\t' + command + '\n')

            } else {
                trace('Compile', file.relativeTo('.'))
                run(command)
            }
        }
    }

    /*
        Copy files[] to path
     */
    function buildFile(target) {
        //  MOB - if target.path is a directory, then stale should check path.join(file)
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        runScript(target.scripts, 'prebuild')
        setRuleVars(target, 'file')
        for each (let file: Path in target.files) {
            /* Auto-generated headers targets for includes have file == target.path */
            if (file == target.path) {
                continue
            }
            if (generating == 'sh') {
                genout.writeLine('rm -rf ' + target.path.relative)
                genout.writeLine('cp -r ' + file.relative + ' ' + target.path.relative + '\n')

            } else if (generating == 'make') {
                genout.writeLine(platformReplace(target.path.relative) + ': ' + platformReplace(getTargetDeps(target)))
                genout.writeLine('\trm -fr ' + target.path.relative)
                genout.writeLine('\tcp -r ' + file.relative + ' ' + target.path.relative + '\n')

            } else if (generating == 'nmake') {
                genout.writeLine(platformReplace(target.path.relative) + ': ' + platformReplace(getTargetDeps(target)))
                genout.writeLine('\tif exist ' + target.path.relative.windows + ' del /Q ' + target.path.relative.windows)
                genout.writeLine('\txcopy /S ' + file.relative.windows + ' ' + target.path.relative.windows + '\n')

            } else {
                trace('Copy', target.path.relativeTo('.'))
                safeRemove(target.path)
                cp(file, target.path)
            }
        }
    }

    /*
        This is for scripts with a 'when' == 'build'
     */
    function buildScript(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        bit.ARCH = bit.platform.arch
        setRuleVars(target, 'file')
        if (generating == 'sh') {
            let command = target['generate-sh']
            if (command) {
                command = command.replace(/^[ \t]*/mg, '')
                command = command.trim()
                command = command.expand(bit)
                command = platformReplace(command)
                genout.writeLine(command)
            } else {
                genout.writeLine('#  Omit build script ' + target.path)
            }

        } else if (generating == 'make') {
            genout.writeLine(platformReplace(target.path.relative) + ': ' + platformReplace(getTargetDeps(target)))
            let command ||= target['generate-make']
            let command ||= target['generate-sh']
            if (command) {
                command = command.replace(/^[ \t]*/mg, '\t')
                command = command.trim()
                command = command.expand(bit)
                command = platformReplace(command)
                genout.writeLine('\t' + command + '\n')
            }

        } else if (generating == 'nmake') {
            genout.writeLine(platformReplace(target.path.relative.windows) + ': ' + platformReplace(getTargetDeps(target)))
            let command ||= target['generate-nmake']
            let command ||= target['generate-make']
            let command ||= target['generate-sh']
            if (command) {
                command = command.replace(/^[ \t]*/mg, '\t')
                command = command.trim()
                command = command.expand(bit)
                command = platformReplace(command)
                command = command.replace(/\//g, '\\')
                genout.writeLine('\t' + command + '\n')
            } else {
                genout.writeLine('#  Omit build script ' + target.path + '\n')
            }

        } else {
            vtrace(target.type.toPascal(), target.name)
            runScript(target.scripts, 'build')
        }
    }

    //  MOB - rename
    /*
        Replace default defines, includes, libraries etc with token equivalents. This allows
        Makefiles and script to be use variables to control various flag settings.
     */
    function genReplace(command: String): String {
        if (generating == 'make' || generating == 'nmake') {
            //  Twice because ldflags are repeated
            command = command.replace(gen.linker, '$(LDFLAGS)')
            command = command.replace(gen.linker, '$(LDFLAGS)')
            command = command.replace(gen.compiler, '$(CFLAGS)')
            command = command.replace(gen.defines, '$(DFLAGS)')
            command = command.replace(gen.includes, '$(IFLAGS)')
            command = command.replace(gen.libraries, '$(LIBS)')
            command = command.replace(RegExp(gen.platform, 'g'), '$$(PLATFORM)')
            command = command.replace(bit.packs.compiler.path, '$(CC)')
        } else if (generating == 'sh') {
            command = command.replace(gen.linker, '${LDFLAGS}')
            command = command.replace(gen.linker, '${LDFLAGS}')
            command = command.replace(gen.compiler, '${CFLAGS}')
            command = command.replace(gen.defines, '${DFLAGS}')
            command = command.replace(gen.includes, '${IFLAGS}')
            command = command.replace(gen.libraries, '${LIBS}')
            command = command.replace(RegExp(gen.platform, 'g'), '$${PLATFORM}')
            command = command.replace(bit.packs.compiler.path, '${CC}')
        }
        command = command.replace(RegExp(bit.dir.top + '/', 'g'), '')
        command = command.replace(/  */g, ' ')
        if (generating == 'nmake') {
            command = command.replace(/\//g, '\\')
        }
        return command
    }

    //  MOB - rename
    function platformReplace(command: String): String {
        command = command.replace(RegExp(bit.dir.top + '/', 'g'), '')
        if (generating == 'make') {
            command = command.replace(RegExp(gen.platform, 'g'), '$$(PLATFORM)')
        } else if (generating == 'nmake') {
            command = command.replace(RegExp(gen.platform, 'g'), '$$(PLATFORM)')
            command = command.replace(/\//g, '\\')
        } else if (generating == 'sh') {
            command = command.replace(RegExp(gen.platform, 'g'), '$${PLATFORM}')
        }
        return command
    }

    /*
        Get the dependencies of a target as a string
     */
    function getTargetDeps(target): String {
        let deps = []
        if (!target.depends || target.depends.length == 0) {
            return ''
        } else {
            for each (let dname in target.depends) {
                let dep = bit.targets[dname]
                if (dep && dep.enable) {
                    deps.push(dep.path.relative)
                }
            }
            return ' \\\n        ' + deps.join(' \\\n        ')
        }
    }

    /*
        Set top level constant variables. This enables them to be used in token expansion
     */
    function setConstVars() {
        bit.ARCH = bit.platform.arch
        if (bit.ext.exe) {
            bit.EXE = '.' + bit.ext.exe
        } else {
            bit.EXE = ''
        }
        bit.OBJ = '.' + bit.ext.obj
        bit.SHOBJ = '.' + bit.ext.shobj
        bit.SHLIB = '.' + bit.ext.shlib

        bit.CFG = bit.dir.cfg.portable
        bit.BIN = bit.dir.bin.portable
        bit.BITS = bit.dir.bits.portable
        bit.FLAT = bit.dir.flat.portable
        bit.INC = bit.dir.inc.portable
        bit.LIB = bit.dir.lib.portable
        bit.OBJ = bit.dir.obj.portable
        bit.PACKS = bit.dir.packs
        bit.PKG = bit.dir.pkg.portable
        bit.REL = bit.dir.rel.portable
        bit.SRC = bit.dir.src.portable
        bit.TOP = bit.dir.top.portable
        bit.OS = bit.platform.os
        bit.ARCH = bit.platform.arch
        bit.PLATFORM = bit.platform.name
        bit.LIKE = bit.platform.like
        for each (name in ["ARCH", "BIN", "CFG", "FLAT", "INC", "LIB", "LIKE", "OBJ", "OS", "PACKS", "PKG", "PLATFORM",
                "REL", "SHLIB", "SHOBJ", "SRC", "TOP"]) {
            global[name] = bit[name]
        }
    }

    /*
        Set essential bit variables for build rules
     */
    function setRuleVars(target, kind, file = null) {
        bit.OUT = target.path
        bit.TARGET = target
        bit.HOME = target.home
        //  MOB - can we do this universally?
        if (generating) {
            if (bit.HOME) {
                bit.HOME = bit.HOME.relative
            }
        }
        if (kind == 'exe') {
            bit.IN = target.files.join(' ')
            bit.LIBS = mapLibs(target.libraries)
        } else if (kind == 'lib') {
            bit.OUT = target.path
            bit.LIBNAME = target.path.basename
            bit.IN = target.files.join(' ')
            bit.DEF = Path(target.path.toString().replace(/dll$/, 'def'))
            bit.LIBS = mapLibs(target.libraries)
        } else if (kind == 'obj') {
            bit.IN = file
            bit.CFLAGS = (target.compiler) ? target.compiler.join(' ') : ''
            bit.DEFINES = (target.defines) ? target.defines.join(' ') : ''
            bit.INCLUDES = (target.includes) ? target.includes.map(function(e) '-I' + e) : ''
        }
    }

    /*
        Set the PATH and LD_LIBRARY_PATH environment variables
     */
    function setPathEnvVar() {
        outbin = Path('.').join(localPlatform + '-' + bit.settings.profile, 'bin').absolute
        bitbin = bit.dir.bits.join('bin')
        let sep = App.SearchSeparator
        if (generating) {
            outbin = outbin.relative
            bitbin = bitbin.relative
        }
        if (generating == 'make') {
            if (local.os == 'WIN') sep = ';'
            genout.writeLine('export PATH := ' + outbin + sep + bitbin + sep + '${PATH}')
            if (Config.OS == 'MACOSX') {
                genout.writeLine('export DYLD_LIBRARY_PATH := ' + outbin + sep + bitbin + sep + '${DYLD_LIBRARY_PATH}')
            } else {
                genout.writeLine('export LD_LIBRARY_PATH := ' + outbin + sep + bitbin + sep + '${LD_LIBRARY_PATH}')
            }
            genout.writeLine('')

        } else if (generating == 'nmake') {
            if (local.os == 'WIN') sep = ';'
            genout.writeLine('PATH = ' + outbin + sep + bitbin + sep + '${PATH}')
            genout.writeLine('')

        } else if (generating == 'sh') {
            if (local.os == 'WIN') sep = ';'
            genout.writeLine('export PATH="' + outbin + sep + bitbin + sep + '${PATH}' + '"')
            if (Config.OS == 'MACOSX') {
                genout.writeLine('export DYLD_LIBRARY_PATH="' + outbin + sep + bitbin + sep + '${DYLD_LIBRARY_PATH}' + '"')
            } else {
                genout.writeLine('export LD_LIBRARY_PATH="' + outbin + sep + bitbin + sep + '${LD_LIBRARY_PATH}' + '"')
            }
            genout.writeLine('')

        } else {
            App.putenv('PATH', outbin + sep + bitbin + sep + App.getenv('PATH'))
            App.log.debug(2, "PATH=" + App.getenv('PATH'))
            if (Config.OS == 'MACOSX') {
                App.putenv('DYLD_LIBRARY_PATH', outbin + sep + bitbin + sep + App.getenv('DYLD_LIBRARY_PATH'))
            } else {
                App.putenv('LD_LIBRARY_PATH', outbin + sep + bitbin + sep + App.getenv('LD_LIBRARY_PATH'))
            }
        }
    }

    /*
        Run an event script.
        When values used are: prebuild, postblend, preresolve, presource, prebuild, action
     */
    function runScript(scripts, when) {
        if (scripts) {
            for each (item in scripts[when]) {
                // let script = item.script.expand(bit, {fill: ''}).replace(/\\/g, '\\\\')
                let script = item.script.expand(bit, {fill: ''})
                let pwd = App.dir
                if (item.home && item.home != pwd) {
                    App.chdir(item.home)
                }
                try {
                    script = 'require ejs.unix\n' + script
                    eval(script)
                } finally {
                    App.chdir(pwd)
                }
            }
        }
    }

    /*
        Map libraries into the appropriate O/S dependant format
     */
    function mapLibs(libs: Array): Array {
        if (bit.platform.os == 'win') {
            libs = libs.clone()
            for (i in libs) {
                let llib = bit.dir.lib.join("lib" + libs[i]).joinExt(bit.ext.shlib)
                if (llib.exists || generating) {
                    libs[i] = llib
                } else {
                    libs[i] = Path(libs[i]).replaceExt(bit.ext.shlib).relative
                }
            }
        } else if (bit.platform.os == 'vxworks') {
            libs = libs.clone()
            for (i = 0; i < libs.length; i++) {
                if (libs.contains(libs[i])) {
                    libs.remove(i)
                    i--
                }
            }
            for (i in libs) {
                let llib = bit.dir.lib.join("lib" + libs[i]).joinExt(bit.ext.shlib).relative
                if (llib.exists) {
                    libs[i] = llib
                } else {
                    libs[i] = '-l' + Path(libs[i]).trimExt().toString().replace(/^lib/, '')
                }
            }
        } else {
            libs = libs.map(function(e) '-l' + Path(e).trimExt().relative.toString().replace(/^lib/, ''))
        }
        return libs
    }

    /*
        Test if a target is stale vs the inputs AND dependencies
     */
    function stale(target) {
        if (target.built) {
            return false
        }
        if (generating) {
            return true
        }
        if (!target.path) {
            return true
        }
        let path = target.path
        if (!path.modified) {
            whyRebuild(target.name, 'Rebuild', target.path + ' is missing.')
            return true
        }
        for each (file in target.files) {
            if (file.modified > path.modified) {
                whyRebuild(path, 'Rebuild', 'input ' + file + ' has been modified.')
                return true
            }
        }
        for each (let dname: Path in target.depends) {
            let file
            if (!bit.targets[dname]) {
                let pack = bit.packs[dname]
                if (pack) {
                    if (!pack.enable) {
                        continue
                    }
                    file = pack.path
                    if (!file) {
                        whyRebuild(path, 'Rebuild', 'missing ' + file + ' for package ' + dname)
                        return true
                    }
                } else {
                    /* If dependency is not a target, then treat as a file */
                    if (!dname.modified) {
                        whyRebuild(path, 'Rebuild', 'missing dependency ' + dname)
                        return true
                    }
                    if (dname.modified > path.modified) {
                        whyRebuild(path, 'Rebuild', 'dependency ' + dname + ' has been modified.')
                        return true
                    }
                    return false
                }
            } else {
                file = bit.targets[dname].path
            }
            if (file.modified > path.modified) {
                whyRebuild(path, 'Rebuild', 'dependent ' + file + ' has been modified.')
                return true
            }
        }
        return false
    }

    /*
        Create an array of dependencies for a target
     */
    function makeDepends(target): Array {
        let includes: Array = []
        for each (path in target.files) {
            let str = path.readString()
            //  MOB - refactor when array += null is a NOP
            let more = str.match(/^#include.*"$/gm)
            if (more) {
                includes += more
            }
        }
        /*  FUTURE let depends = [ bit.dir.inc.join('bit.h') ] */
        let depends = [ bit.dir.inc.join('buildConfig.h') ]

        /*
            Resolve includes 
         */
        for each (item in includes) {
            let ifile = item.replace(/#include.*"(.*)"/, '$1')
            let path
            for each (dir in target.includes) {
                path = Path(dir).join(ifile)
                if (path.exists && !path.isDir) {
                    break
                }
                path = null
            }
            if (path && !depends.contains(path)) {
                depends.push(path)
            }
        }
        return depends
    }

    /*
        Expand tokens in all fields in an object hash. This is used to expand tokens in bit file objects.
     */
    function expandTokens(o) {
        for (let [key,value] in o) {
            if (value is String) {
                o[key] = value.expand(bit, {fill: '${}'})
            } else if (value is Path) {
                o[key] = Path(value.toString().expand(bit, {fill: '${}'}))
            } else if (Object.getOwnPropertyCount(value) > 0) {
                o[key] = expandTokens(value)
            }
        }
        return o
    }

    /*
        Run a command and trace output if cmdOptions.true or options.show
     */
    public function run(command, cmdOptions = {}): String {
        if (options.show) {
            if (command is Array) {
                trace('Run', command.join(' '))
            } else {
                trace('Run', command)
            }
        }
        let cmd = new Cmd
        if (bit.env) {
            let env = {}
            for (let [key,value] in bit.env) {
                if (value is Array) {
                    env[key] = value.join(App.SearchSeparator)
                } else {
                    env[key] = value
                }
            }
            cmd.env = env
        }
        App.log.debug(2, "Command " + command)
        cmd.start(command, cmdOptions)
        if (cmd.status != 0 && !cmdOptions.continueOnErrors) {
            if (!cmd.error || cmd.error == '') {
                throw 'Command failure: ' + cmd.response + '\nCommand: ' + command
            } else {
                throw 'Command failure: ' + cmd.error + '\nCommand: ' + command
            }
        }
        if (options.show || cmdOptions.show) {
            if (!cmdOptions.noshow) {
                out.write(cmd.response)
                out.write(cmd.error)
            }
        }
        return cmd.response
    }

    /*
        Make required output directories (carefully). Only make dirs inside the 'src' or 'top' directories.
     */
    function makeOutDirs() {
        for each (d in bit.dir) {
            if (d.startsWith(bit.dir.top) || d.startsWith(bit.dir.src)) {
                d.makeDir()
            }
        }
    }

    public function trace(tag: String, ...args): Void {
        if (!options.quiet) {
            let msg = args.join(" ")
            let msg = "%12s %s" % (["[" + tag + "]"] + [msg]) + "\n"
            out.write(msg)
        }
    }

    public function vtrace(tag, msg) {
        if (options.verbose) {
            trace(tag, msg)
        }
    }

    public function whyRebuild(path, tag, msg) {
        if (options.why) {
            trace(tag, path + ' because ' + msg)
        }
    }

    function whySkip(path, msg) {
        if (options.why) {
            trace('Target', path + ' ' + msg)
        }
    }

    function whyMissing(msg) {
        if (options.why) {
            trace('Init', msg)
        }
    }

    function diagnose(msg) {
        if (options.diagnose) {
            trace('Debug', msg)
        }
    }

    /*
        Run an action
     */
    public function action(cmd: String, actionOptions: Object = {}) {
        switch (cmd) {
        case 'cleanTargets':
            for each (target in bit.targets) {
                if (target.path && targetsToClean[target.type]) {
                    /* Pre-built targets must be preserved */
                    if (target.path.startsWith(bit.dir.cfg) && !target.built) {
                        if (generating == 'make') {
                            genout.writeLine('\trm -rf ' + platformReplace(target.path.relative))

                        } else if (generating == 'nmake') {
                            genout.writeLine('\tif exist ' + platformReplace(target.path.relative) + ' del /Q ' +
                                platformReplace(target.path.relative))

                        } else if (generating == 'sh') {
                            genout.writeLine('rm -f ' + platformReplace(target.path.relative))

                        } else if (target.path.exists) {
                            if (options.show) {
                                trace('Clean', target.path)
                            }
                            safeRemove(target.path)
                        }
                    }
                }
            }
            break
        }
    }

    function like(os) {
        if (posix.contains(os)) {
            return "posix"
        } else if (windows.contains(os)) {
            return "windows"
        }
        return ""
    }

    function dist(os) {
        let dist = { macosx: 'apple', win: 'ms', 'linux': 'ubuntu' }[os]
        if (os == 'linux') {
            let relfile = Path('/etc/redhat-release')
            if (relfile.exists) {
                let rver = relfile.readString()
                if (rver.contains('Fedora')) {
                    dist = 'fedora'
                } else if (rver.contains('Red Hat Enterprise')) {
                    dist = 'rhl'
                } else {
                    dist = 'fedora'
                }
            } else if (Path('/etc/SuSE-release').exists) {
                dist = 'suse'
            } else if (Path('/etc/gentoo-release').exists) {
                dist = 'gentoo'
            }
        }
        return dist
    }

    /*
        Map the architecture into an MPR architecture flag
        MOB - move to embedthis.es
     */
    function getMprArch(arch) {
        if (arch.match(/^i.86$|^x86$/)) {
            return 'MPR_CPU_IX86'
        } else if (arch.match(/^x86_64$|^amd64$/)) {
            return 'MPR_CPU_IX64'
        } else if (arch.match(/^power|^ppc/)) {
            return 'MPR_CPU_PPC'
        } else if (arch.match(/^sparc$/)) {
            return 'MPR_CPU_SPARC'
        } else if (arch.match(/^xscale$/)) {
            return 'MPR_CPU_XSCALE'
        } else if (arch.match(/^arm$|^strongarm$|^xscale$/)) {
            return 'MPR_CPU_ARM'
        } else if (arch.match(/^mips$/)) {
            return 'MPR_CPU_MIPS'
        } else if (arch.match(/^sh/)) {
            return 'MPR_CPU_SH4'
        }
        return 'MPR_CPU_UNKNOWN'
    }

    public static function load(o: Object) {
        b.loadInternal(o)
    }

    public static function loadFile(path: Path) {
        b.loadWrapper(path)
    }

    public function safeRemove(dir: Path) {
        if (bit.dir.top.same('/') || !dir.startsWith(bit.dir.top)) {
            throw 'Unsafe attempt to remove ' + dir + ' expected parent ' + bit.dir.top
        }
        dir.removeAll()
    }
}

} /* bit module */


/*
    Global functions for bit files
 */
require embedthis.bit

public var b: Bit = new Bit
b.main()

public function probe(file: Path, options = {}): Path {
    return b.probe(file, options)
}

public function program(name) {
    let packs = {}
    packs[name] = { path: probe(name, {fullpath: true})}
    Bit.load({packs: packs})
}

public function action(command: String, options = null)
    b.action(command, options)

public function trace(tag, msg)
    b.trace(tag, msg)

public function vtrace(tag, msg)
    b.vtrace(tag, msg)

public function install(src, dest: Path, options = {})
    b.install(src, dest, options)

public function package(formats)
    b.package(formats)

public function run(command, options = {})
    b.run(command, options)

public function safeRemove(dir: Path)
    b.safeRemove(dir)

function whyRebuild(path, tag, msg)
    b.whyRebuild(path, tag, msg)

/*
    @copy   default
  
    Copyright (c) Embedthis Software LLC, 2003-2012. All Rights Reserved.
    Copyright (c) Michael O'Brien, 1993-2012. All Rights Reserved.
  
    This software is distributed under commercial and open source licenses.
    You may use the GPL open source license described below or you may acquire
    a commercial license from Embedthis Software. You agree to be fully bound
    by the terms of either license. Consult the LICENSE.TXT distributed with
    this software for full details.
  
    This software is open source; you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by the
    Free Software Foundation; either version 2 of the License, or (at your
    option) any later version. See the GNU General Public License for more
    details at: http://www.embedthis.com/downloads/gplLicense.html
  
    This program is distributed WITHOUT ANY WARRANTY; without even the
    implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  
    This GPL license does NOT permit incorporating this software into
    proprietary programs. If you are unable to comply with the GPL, you must
    acquire a commercial license to use this software. Commercial licenses
    for this software and support services are available from Embedthis
    Software at http://www.embedthis.com
  
    Local variables:
    tab-width: 4
    c-basic-offset: 4
    End:
    vim: sw=4 ts=4 expandtab

    @end
 */
