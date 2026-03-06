cmake_minimum_required(VERSION 3.22)
project(react-native-qmdb)

set(CMAKE_CXX_STANDARD 20)

# Find NitroModules
find_package(react-native-nitro-modules REQUIRED CONFIG)

# Import the pre-built Rust shared library
add_library(qmdb_mobile SHARED IMPORTED)
set_target_properties(qmdb_mobile PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libqmdb_mobile.so
)

# Our C++ HybridObject
add_library(${PROJECT_NAME} SHARED
  ../cpp/HybridQMDB.hpp
  ../cpp/OnLoad.cpp
)

target_include_directories(${PROJECT_NAME} PRIVATE
  ../cpp
  ../ios  # for QMDBBridge.h
)

target_link_libraries(${PROJECT_NAME}
  react-native-nitro-modules::NitroModules
  qmdb_mobile
  log
)
