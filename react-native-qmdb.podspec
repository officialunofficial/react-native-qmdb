require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-qmdb"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["repository"]["url"].gsub(".git", "")
  s.license      = package["license"]
  s.authors      = "Official Unofficial"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => package["repository"]["url"], :tag => s.version.to_s }

  # C++ HybridObject + Rust C header
  s.source_files = "cpp/**/*.{hpp,cpp,h}", "ios/**/*.h"
  s.header_mappings_dir = "cpp"

  # Pre-built Rust static library
  s.vendored_libraries = "ios/libqmdb_mobile.a"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_TARGET_SRCROOT)/cpp",
      "$(PODS_TARGET_SRCROOT)/ios",
    ].join(" "),
    "OTHER_LDFLAGS" => "-lqmdb_mobile",
    "LIBRARY_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/ios",
  }

  s.dependency "react-native-nitro-modules"
end
